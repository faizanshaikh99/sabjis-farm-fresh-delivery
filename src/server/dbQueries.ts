import express from "express";
import {
  supabase,
  isSupabaseConfigured,
  requireSupabase,
  DatabaseError,
  TABLE_SELECT_COLUMNS,
  fetchTable,
  fetchAllRows,
  fetchOneRow,
  upsertTable,
  deleteFromTable,
  deleteWhere,
  uploadToSupabaseStorage,
  syncPaymentAuditToSupabase,
  normalizeProductFromDb
} from "../db/supabaseService";
import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_BUSINESS_SETTINGS,
  DEFAULT_PAYMENT_SETTINGS,
  cleanPhone,
  sanitizePostgrestValue,
  buildPostgrestPhoneFilter,
  normalizeUtr,
  normalizeUser,
  normalizeOrderFromDb,
  isUserAccountActive,
  isUserAdmin,
  mapBusinessSettingsFromDb,
  mapPaymentSettingsFromDb,
  mapCategoryFromDb,
  mapAddressFromDb,
  mapPasswordResetToDb
} from "./mappers";

export const asyncHandler = (
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any> | any
) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ── REAL-TIME SSE HUB ──
export interface RealtimeClient {
  res: express.Response;
  userId: string | null;
  isAdmin: boolean;
}

export const realtimeClients = new Set<RealtimeClient>();

export function broadcastRealtimeEvent(event: {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  new?: any;
  old?: any;
  timestamp?: string;
}) {
  const payload = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  });

  const sseMessage = `event: postgres_changes\ndata: ${payload}\n\n`;
  const isOrderEvent = event.table === 'orders';
  const orderOwnerId = isOrderEvent
    ? String(
        event.new?.userId ||
        event.new?.user_id ||
        event.new?.customerId ||
        event.new?.customer_id ||
        event.old?.userId ||
        event.old?.user_id ||
        event.old?.customerId ||
        event.old?.customer_id ||
        ''
      )
    : '';

  for (const client of Array.from(realtimeClients)) {
    if (isOrderEvent) {
      const authorized =
        client.isAdmin ||
        (Boolean(client.userId) && Boolean(orderOwnerId) && orderOwnerId !== 'guest' && String(client.userId) === orderOwnerId);
      if (!authorized) continue;
    }
    try {
      client.res.write(sseMessage);
    } catch {
      realtimeClients.delete(client);
    }
  }
}

// ── NEGATIVE SESSION CACHE (Short-lived optimization, NOT source of truth) ──
const failedSessionLookups = new Map<string, number>();

export function isSessionKnownInvalid(sessionId: string): boolean {
  if (!sessionId) return true;
  const failedAt = failedSessionLookups.get(sessionId);
  if (!failedAt) return false;
  if (Date.now() - failedAt > 30000) {
    failedSessionLookups.delete(sessionId);
    return false;
  }
  return true;
}

export function markSessionInvalid(sessionId: string) {
  if (!sessionId) return;
  if (failedSessionLookups.size > 1000) {
    const oldestKey = failedSessionLookups.keys().next().value;
    if (oldestKey) failedSessionLookups.delete(oldestKey);
  }
  failedSessionLookups.set(sessionId, Date.now());
}

export function clearSessionInvalid(sessionId: string) {
  if (sessionId) failedSessionLookups.delete(sessionId);
}

export async function revokeAllUserSessions(userId: string) {
  if (!userId) return;
  const existing = await fetchTable('sessions', {
    filter: (q) => q.eq('user_id', String(userId))
  });
  existing.forEach((s: any) => {
    if (s.id) markSessionInvalid(String(s.id));
    if (s.token) markSessionInvalid(String(s.token));
  });
  await deleteFromTable('sessions', 'user_id', String(userId));
}

// ── SCREENSHOT & STORAGE HELPERS ──
const ALLOWED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function saveScreenshotToStorageAsync(rawUrlOrBase64: string | undefined, orderId: string): Promise<string> {
  if (!rawUrlOrBase64 || typeof rawUrlOrBase64 !== 'string' || !rawUrlOrBase64.trim()) {
    return '';
  }
  const str = rawUrlOrBase64.trim();
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }
  if (str.startsWith('data:image/')) {
    const matches = str.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new DatabaseError('Invalid screenshot data URL format.', 400, 'CONSTRAINT_ERROR', 'storage:screenshots');
    }
    let ext = matches[1].toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      throw new DatabaseError('Unsupported screenshot format. Only PNG, JPG, JPEG, and WebP are allowed.', 400, 'CONSTRAINT_ERROR', 'storage:screenshots');
    }
    if (ext === 'jpeg') ext = 'jpg';
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > MAX_SCREENSHOT_BYTES) {
      throw new DatabaseError('Screenshot image size exceeds the 5MB limit.', 400, 'CONSTRAINT_ERROR', 'storage:screenshots');
    }
    const safeOrderId = String(orderId || 'ord').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `screenshot_${safeOrderId || 'ord'}_${Date.now()}.${ext}`;
    return await uploadToSupabaseStorage('screenshots', filename, buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  }
  return str;
}

// ── SUPABASE QUERY & SYNC HELPERS ──
export async function getBusinessSettingsFromDb() {
  const rows = await fetchTable('business_settings', { limit: 1 });
  return mapBusinessSettingsFromDb(rows[0] || null);
}

export async function getPaymentSettingsFromDb() {
  const rows = await fetchTable('payment_settings', { limit: 1 });
  return mapPaymentSettingsFromDb(rows[0] || null);
}

export async function getCategoriesFromDb() {
  const rows = await fetchAllRows('categories');
  const mapped = rows.map(mapCategoryFromDb);
  if (!mapped.some((c: any) => c.id === 'all')) {
    mapped.unshift({ id: 'all', label: 'All Sabjies', emoji: '🥗' });
  }
  return mapped;
}

export async function getAllProductsFromDb() {
  const rows = await fetchAllRows('products', {
    orderBy: { column: 'id', ascending: true }
  });
  return rows.map(normalizeProductFromDb).filter(Boolean);
}

export async function getProductByIdFromDb(id: number) {
  const row = await fetchOneRow('products', (q) => q.eq('id', id));
  return row ? normalizeProductFromDb(row) : null;
}

export async function getUserByIdFromDb(userId: string) {
  const row = await fetchOneRow('users', (q) => q.eq('id', String(userId)));
  return row ? normalizeUser(row) : null;
}

export async function getUserByIdentifierFromDb(rawIdentifier: string) {
  const trimmed = String(rawIdentifier || '').trim();
  if (!trimmed) return null;
  const cleanId = trimmed.toLowerCase();
  const isEmail = cleanId.includes('@');

  if (isEmail) {
    const safeEmail = sanitizePostgrestValue(cleanId);
    const row = await fetchOneRow('users', (q) => q.ilike('email', safeEmail));
    return row ? normalizeUser(row) : null;
  }

  const cleanedPhoneId = cleanPhone(cleanId);
  const phoneFilter = buildPostgrestPhoneFilter(trimmed, cleanedPhoneId);
  const rows = await fetchTable('users', {
    filter: (q) => q.or(phoneFilter),
    limit: 10
  });
  const matched = rows.find((du: any) =>
    (cleanedPhoneId && cleanPhone(du.phone || '') === cleanedPhoneId) ||
    (du.phone && String(du.phone).trim() === trimmed) ||
    String(du.id) === trimmed
  );
  return matched ? normalizeUser(matched) : null;
}

export async function getAddressesForUserFromDb(userId: string) {
  const rows = await fetchTable('addresses', {
    filter: (q) => q.eq('user_id', String(userId))
  });
  if (rows.length > 0) {
    return rows.map(mapAddressFromDb);
  }
  const user = await getUserByIdFromDb(userId);
  if (user && Array.isArray(user.addresses) && user.addresses.length > 0) {
    return user.addresses.map((a: any) => mapAddressFromDb({ ...a, user_id: userId }));
  }
  return [];
}

export async function getOrderByIdFromDb(orderId: string) {
  const cleanId = String(orderId || '').trim();
  if (!cleanId) return null;
  const row = await fetchOneRow('orders', (q) => q.eq('id', cleanId));
  return row ? normalizeOrderFromDb(row) : null;
}

export async function findDuplicateUtrInDb(utrString: string | undefined | null, excludeOrderId?: string): Promise<any | null> {
  if (!utrString) return null;
  const clean = normalizeUtr(utrString);
  if (clean.length < 4) return null;

  const safeRaw = sanitizePostgrestValue(String(utrString).trim());
  if (safeRaw) {
    const matchingOrders = await fetchTable('orders', {
      columns: 'id,utr,utr_number,razorpay_payment_id',
      filter: (q) => q.or(`utr.ilike."%${safeRaw}%",utr_number.ilike."%${safeRaw}%"`)
    });
    const orderMatch = matchingOrders.find((o: any) => {
      if (excludeOrderId && String(o.id) === String(excludeOrderId)) return false;
      return normalizeUtr(o.utr || o.utr_number || o.razorpay_payment_id) === clean;
    });
    if (orderMatch) return orderMatch;

    const matchingTxns = await fetchTable('payment_transactions', {
      columns: 'id,order_id,utr,transaction_id',
      filter: (q) => q.or(`utr.ilike."%${safeRaw}%",transaction_id.ilike."%${safeRaw}%"`)
    });
    const txnMatch = matchingTxns.find((t: any) => {
      if (excludeOrderId && String(t.order_id) === String(excludeOrderId)) return false;
      return normalizeUtr(t.utr || t.transaction_id) === clean;
    });
    if (txnMatch) return { id: txnMatch.order_id };
  }

  return null;
}

export async function syncUserToSupabase(user: any): Promise<boolean> {
  const nowIso = new Date().toISOString();
  return await upsertTable('users', [{
    id: String(user.id),
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    password: user.password || '',
    role: user.role || 'user',
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    joined_at: user.joinedAt || user.joined_at || nowIso,
    status: user.status || 'Active',
    must_change_password: Boolean(user.mustChangePassword),
    updated_at: nowIso
  }], 'id');
}

export async function syncPasswordResetToSupabase(reqItem: any): Promise<boolean> {
  return await upsertTable('password_resets', [mapPasswordResetToDb(reqItem)], 'id');
}

export async function syncNotificationToSupabase(notif: any): Promise<boolean> {
  return await upsertTable('notifications', [{
    id: String(notif.id),
    user_id: notif.userId ? String(notif.userId) : null,
    title: notif.title || '',
    body: notif.body || '',
    type: notif.type || 'info',
    read: Boolean(notif.read),
    created_at: notif.createdAt || new Date().toISOString()
  }], 'id');
}

export async function recordLoginHistoryInDb(entry: {
  userId: string;
  identifier: string;
  status: 'Success' | 'Failed';
  ip: string;
  userAgent: string;
}) {
  try {
    await upsertTable('login_history', [{
      id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      user_id: entry.userId,
      identifier: entry.identifier,
      status: entry.status,
      ip: entry.ip,
      user_agent: entry.userAgent,
      timestamp: new Date().toISOString()
    }], 'id');
  } catch (err) {
    console.warn('[Auth] Failed to record login history:', err);
  }
}

export function logAuditEvent(performedBy: string, action: string, details: any) {
  const row = {
    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    action,
    performed_by: performedBy || 'system',
    user_id: performedBy || 'system',
    details: details || {},
    timestamp: new Date().toISOString()
  };
  if (isSupabaseConfigured && supabase) {
    upsertTable('audit_logs', [row], 'id').catch((err) => {
      console.warn('[Audit Log Sync Warning]:', err?.message || err);
    });
  }
}

export function appendPaymentAudit(order: any, entry: {
  action: string;
  performedBy: string;
  previousPaymentStatus?: string;
  newPaymentStatus?: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}) {
  if (!order) return;
  if (!Array.isArray(order.paymentAuditTrail)) {
    order.paymentAuditTrail = [];
  }
  const auditEntry = {
    id: 'paudit_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    orderId: String(order.id),
    action: entry.action,
    performedBy: entry.performedBy || 'system',
    previousPaymentStatus: entry.previousPaymentStatus || order.paymentStatus || 'Pending',
    newPaymentStatus: entry.newPaymentStatus || order.paymentStatus || 'Pending',
    amount: entry.amount !== undefined ? entry.amount : order.total,
    reason: entry.reason || '',
    metadata: entry.metadata || {},
    createdAt: new Date().toISOString()
  };
  order.paymentAuditTrail.unshift(auditEntry);

  logAuditEvent(entry.performedBy || 'system', `Payment: ${entry.action}`, {
    orderId: order.id,
    action: entry.action,
    previousPaymentStatus: auditEntry.previousPaymentStatus,
    newPaymentStatus: auditEntry.newPaymentStatus,
    amount: auditEntry.amount,
    reason: auditEntry.reason
  });

  if (isSupabaseConfigured && supabase) {
    syncPaymentAuditToSupabase(auditEntry).catch(err => {
      console.warn(`[Payment Audit Sync Notice] ${err?.message || err}`);
    });
  }
}

// ── SESSION & ADMIN AUTHENTICATION ──
export function extractSessionToken(req: express.Request): string | null {
  const token =
    (req.headers['x-session-id'] as string) ||
    (req.query.sessionId as string) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);
  return token ? String(token).trim() : null;
}

export async function getUserIdFromRequestAsync(req: express.Request): Promise<string | null> {
  const sessionId = extractSessionToken(req);
  if (!sessionId || isSessionKnownInvalid(sessionId)) {
    return null;
  }

  const safeSid = sanitizePostgrestValue(sessionId);
  if (!safeSid) return null;

  const client = requireSupabase();
  const { data: sess, error } = await client
    .from('sessions')
    .select('id,user_id,token,created_at,expires_at')
    .or(`id.eq."${safeSid}",token.eq."${safeSid}"`)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to verify session: ${error.message}`, 503, 'SUPABASE_UNAVAILABLE', 'sessions');
  }

  if (sess && (!sess.expires_at || new Date() <= new Date(sess.expires_at))) {
    return String(sess.user_id);
  }

  markSessionInvalid(sessionId);
  return null;
}

export async function verifyAdminRequest(req: express.Request): Promise<boolean> {
  const sessionId = extractSessionToken(req);
  if (!sessionId || isSessionKnownInvalid(sessionId)) {
    return false;
  }

  const safeSid = sanitizePostgrestValue(sessionId);
  if (!safeSid) return false;

  const client = requireSupabase();
  const { data: sess, error } = await client
    .from('sessions')
    .select('id,user_id,token,created_at,expires_at')
    .or(`id.eq."${safeSid}",token.eq."${safeSid}"`)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to verify admin session: ${error.message}`, 503, 'SUPABASE_UNAVAILABLE', 'sessions');
  }

  if (sess && (!sess.expires_at || new Date() <= new Date(sess.expires_at))) {
    const dbUser = await getUserByIdFromDb(String(sess.user_id));
    if (dbUser && isUserAccountActive(dbUser) && isUserAdmin(dbUser)) {
      return true;
    }
    return false;
  }

  // Optional Supabase Auth JWT verification
  try {
    if (client.auth && typeof client.auth.getUser === 'function') {
      const { data: authData } = await client.auth.getUser(sessionId);
      if (authData?.user) {
        const email = authData.user.email?.toLowerCase();
        if (email === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
          return true;
        }
        if (email) {
          const u = await getUserByIdentifierFromDb(email);
          if (u && isUserAccountActive(u) && isUserAdmin(u)) {
            return true;
          }
        }
      }
    }
  } catch {}

  markSessionInvalid(sessionId);
  return false;
}

export async function getAdminIdentityFromRequest(req: express.Request): Promise<string> {
  const userId = await getUserIdFromRequestAsync(req).catch(() => null);
  if (userId) {
    const user = await getUserByIdFromDb(userId).catch(() => null);
    if (user && user.email) return `${user.email} (${user.id || 'admin'})`;
    if (user && user.name) return `${user.name} (${user.id || 'admin'})`;
  }
  return `Verified Admin (${DEFAULT_ADMIN_EMAIL})`;
}

// ── RATE LIMITING & TEST SIMULATION GUARD ──
const otpRequestRateLimits = new Map<string, { count: number; firstRequestTime: number }>();

export function checkOtpRateLimit(key: string, limit: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const record = otpRequestRateLimits.get(key);
  if (!record || (now - record.firstRequestTime > windowMs)) {
    otpRequestRateLimits.set(key, { count: 1, firstRequestTime: now });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

export function resetOtpRateLimitsForTesting() {
  otpRequestRateLimits.clear();
}

export function isTestSimulationAllowed(req: express.Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.ALLOW_TEST_OTP_SIMULATION === 'true' || process.env.NODE_ENV === 'test') {
    return true;
  }
  const isTestHeaderPresent = req.headers['x-test-simulation'] === 'true' ||
                              req.headers['x-test-simulate-expired'] === 'true' ||
                              req.headers['x-test-simulate-cooldown-expired'] === 'true';
  if (!isTestHeaderPresent) {
    return false;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    const firstClientIp = forwardedFor.split(',')[0].trim();
    const isForwardedLoopback = firstClientIp === '127.0.0.1' ||
                                firstClientIp === '::1' ||
                                firstClientIp === '::ffff:127.0.0.1' ||
                                firstClientIp === 'localhost';
    if (!isForwardedLoopback) {
      return false;
    }
  }

  const rawRemote = req.socket?.remoteAddress || req.ip || '';
  return rawRemote === '127.0.0.1' ||
         rawRemote === '::1' ||
         rawRemote === '::ffff:127.0.0.1' ||
         rawRemote === 'localhost';
}

export async function invalidateOrderStatusCacheCleanup(userId: string) {
  await deleteWhere('notifications', (q) => q.eq('user_id', userId));
}
