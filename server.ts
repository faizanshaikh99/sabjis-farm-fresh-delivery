import "dotenv/config";
import express from "express";
import compression from "compression";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";

// Process resilience guards to prevent transient socket errors from terminating the dev process
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EADDRINUSE' || err?.message?.includes('WebSocket') || err?.code === 'ECONNRESET') {
    console.warn('[Server Guard] Handled transient socket warning:', err.message || err);
    return;
  }
  console.warn('[Server Guard] Caught unhandled exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server Guard] Caught unhandled rejection:', reason?.message || reason);
});

import {
  supabase,
  isSupabaseConfigured,
  isDatabaseError,
  verifySupabaseConnection,
  inspectSupabaseSchema
} from "./src/db/supabaseService";
import {
  hashPassword,
  verifyPassword,
  isScryptHash,
  isLegacySha256Hash,
  normalizeProduct,
  normalizeOrder,
  normalizeOrderItem,
  normalizePaymentStatus,
  normalizeOrderStatus
} from "./src/server/mappers";
import {
  broadcastRealtimeEvent,
  resetOtpRateLimitsForTesting
} from "./src/server/dbQueries";
import {
  verifyCartAndCalculatePricing,
  reserveOrderStock,
  deductOrderStock,
  permanentlyConsumeOrderStock,
  releaseOrderStock,
  checkAndReleaseExpiredOrders
} from "./src/server/inventoryAndPricing";

import authRoutes from "./src/server/routes/authRoutes";
import catalogRoutes from "./src/server/routes/catalogRoutes";
import orderPaymentRoutes from "./src/server/routes/orderPaymentRoutes";
import adminRoutes from "./src/server/routes/adminRoutes";

const app = express();
const PORT = process.env.RENDER === 'true'
  ? (Number(process.env.PORT) || 3000)
  : 3000;

app.set('strict routing', false);
app.set('case sensitive routing', false);

// ── CORS CONFIGURATION ──
app.use((req, res, next) => {
  const origin = req.headers.origin as string;
  const rawAllowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  ].filter(Boolean) as string[];

  const allowedEnvOrigins = rawAllowedOrigins
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  let allowOrigin = '';
  if (origin) {
    const cleanOrigin = origin.trim().replace(/\/+$/, '');
    if (allowedEnvOrigins.includes(cleanOrigin) || allowedEnvOrigins.some(ao => cleanOrigin === ao)) {
      allowOrigin = origin;
    } else if (
      origin.includes('sabjies.in') ||
      origin.includes('netlify.app') ||
      origin.includes('onrender.com') ||
      origin.includes('run.app') ||
      origin.includes('github.io') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      allowOrigin = origin;
    } else if (allowedEnvOrigins.length === 0) {
      allowOrigin = origin;
    }
  }

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-session-id, x-razorpay-signature, x-idempotency-key, Idempotency-Key'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

// ── SAFE HTTP RESPONSE COMPRESSION ──
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/api/realtime') || req.headers.accept?.includes('text/event-stream')) {
      return false;
    }
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── GLOBAL API RESPONSE HEADERS ──
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/realtime') && !req.path.startsWith('/screenshots')) {
    res.setHeader('Content-Type', 'application/json');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// ── SCREENSHOT STORAGE REDIRECT ──
app.get('/api/screenshots/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename || '');
  if (!safeFilename) {
    return res.status(400).json({ error: 'Invalid screenshot filename' });
  }
  if (isSupabaseConfigured && supabase) {
    const { data } = supabase.storage.from('screenshots').getPublicUrl(safeFilename);
    if (data?.publicUrl) {
      return res.redirect(data.publicUrl);
    }
  }
  return res.status(404).json({ error: 'Screenshot not found' });
});

// ── STRICT SUPABASE CONFIGURATION GATE ──
// Never silently fall back to local JSON or in-memory stores when Supabase is unconfigured
app.use('/api', (req, res, next) => {
  if (
    req.path === '/health' ||
    req.path.startsWith('/realtime') ||
    req.path.startsWith('/screenshots')
  ) {
    return next();
  }
  if (!isSupabaseConfigured || !supabase) {
    return res.status(503).json({
      success: false,
      error: 'Supabase PostgreSQL database is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      code: 'SUPABASE_NOT_CONFIGURED'
    });
  }
  next();
});

// ── DOMAIN API ROUTERS ──
app.use(authRoutes);
app.use(catalogRoutes);
app.use(orderPaymentRoutes);
app.use(adminRoutes);

// ── API 404 & ERROR HANDLERS ──
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.path}`,
    status: 404
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api') || req.url.startsWith('/api')) {
    console.error('[API Error]', err);
    if (isDatabaseError(err)) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code,
        table: err.tableName,
        status: err.statusCode
      });
    }
    const isProduction = process.env.NODE_ENV === 'production';
    const status = typeof err.status === 'number' ? err.status : 500;
    const errorMessage = isProduction && status >= 500
      ? 'Internal server error occurred.'
      : (err.message || 'Internal Server Error');

    return res.status(status).json({
      success: false,
      error: errorMessage,
      status
    });
  }
  next(err);
});

async function startServer() {
  try {
    const supabaseHealth = await verifySupabaseConnection();
    if (supabaseHealth.isConfigured && supabaseHealth.connected) {
      console.log('✅ Supabase Production Database successfully connected and verified.');
      await inspectSupabaseSchema().catch(() => {});
    } else {
      console.error('🚨 [CONFIGURATION ERROR]: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or unreachable.');
      console.error('🚨 Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable database reads and writes (API endpoints will return 503 until configured).');
    }
  } catch (dbErr) {
    console.warn('⚠️ Supabase startup verification warning:', dbErr);
  }

  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

  if (!isProduction) {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true as const,
        hmr: isHmrDisabled ? false : undefined,
        watch: isHmrDisabled ? null : {},
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` });
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-Stack Sabjies Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} already bound or waiting for cleanup.`);
    } else {
      console.error('[Server Error]', err);
    }
  });

  const cleanup = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

if (process.env.SKIP_SERVER_LISTEN !== 'true') {
  startServer();
  setInterval(() => {
    if (isSupabaseConfigured && supabase) {
      checkAndReleaseExpiredOrders().catch((err) => {
        console.warn('[Order Expiration Sweep Warning]', err?.message || err);
      });
    }
  }, 60_000).unref();
}

export {
  app,
  hashPassword,
  verifyPassword,
  isScryptHash,
  isLegacySha256Hash,
  normalizeProduct,
  normalizeOrder,
  normalizeOrderItem,
  normalizePaymentStatus,
  normalizeOrderStatus,
  verifyCartAndCalculatePricing,
  reserveOrderStock,
  deductOrderStock,
  permanentlyConsumeOrderStock,
  releaseOrderStock,
  checkAndReleaseExpiredOrders,
  broadcastRealtimeEvent,
  resetOtpRateLimitsForTesting
};
