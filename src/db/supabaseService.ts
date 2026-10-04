import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isKgProduct } from '../utils/weightParser';
import { runDirectPostgresMigration } from './autoMigratePostgres';

export const tableColumnsMap: Map<string, Set<string>> = new Map();
export const tableMissingColumnsMap: Map<string, Set<string>> = new Map([
  // Seed with known columns that might not exist in standard/older Supabase schemas
  ['products', new Set<string>()],
  ['orders', new Set<string>()]
]);

export interface SupabaseSchemaInspection {
  productColumns: Set<string>;
  hasBasePricePerKg: boolean;
  basePriceColName: 'base_price_per_kg' | 'basePricePerKg' | null;
  hasImages: boolean;
  hasPricingMode: boolean;
  pricingModeColName: 'pricing_mode' | 'pricingMode' | null;
  hasWeightSlabs: boolean;
  weightSlabsColName: 'weight_slabs' | 'weightSlabs' | null;
  hasImg: boolean;
  hasImage: boolean;
  hasImageUrl: boolean;
  hasPaymentMethodDiscountsTable: boolean;
  paymentMethodDiscountsTableName: 'payment_method_discounts' | 'paymentMethodDiscounts' | null;
  hasPaymentTransactionsTable: boolean;
  hasPaymentAuditTrailTable: boolean;
  inspected: boolean;
}

export let cachedSchema: SupabaseSchemaInspection = {
  productColumns: new Set(['id', 'name', 'cat', 'type', 'cp', 'sp', 'unit', 'weight', 'discount', 'img', 'emoji', 'rating', 'reviews', 'stock_qty', 'low_at', 'description', 'created_at', 'updated_at']),
  hasBasePricePerKg: false,
  basePriceColName: null,
  hasImages: false,
  hasPricingMode: false,
  pricingModeColName: null,
  hasWeightSlabs: false,
  weightSlabsColName: null,
  hasImg: true,
  hasImage: false,
  hasImageUrl: false,
  hasPaymentMethodDiscountsTable: false,
  paymentMethodDiscountsTableName: null,
  hasPaymentTransactionsTable: true,
  hasPaymentAuditTrailTable: true,
  inspected: false
};

// Safely ensure .env variables are loaded in Node.js runtime
function loadEnvironmentVariables() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(envPath);
      } catch (e) {}
    }
    // Parse fallback to ensure all variables are populated
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (e) {}
  }
}

loadEnvironmentVariables();

// Read credentials from environment variables safely
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export let supabase: SupabaseClient | null = null;
export let isSupabaseConfigured = false;

if (
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('YOUR_SUPABASE') &&
  !supabaseKey.includes('YOUR_SUPABASE') &&
  supabaseUrl.startsWith('http')
) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    isSupabaseConfigured = true;
  } catch (err) {
    console.error('⚠️ Failed to initialize Supabase client:', err);
  }
}

/**
 * Inspect live Supabase PostgreSQL schema to detect available columns and tables.
 * This prevents runtime PostgREST schema mismatches and guarantees image persistence.
 * Supports both snake_case (PostgreSQL canonical) and camelCase identifiers,
 * handles OpenAPI 2.0 & 3.0 specs, and performs active schema cache verification.
 */
export async function inspectSupabaseSchema(): Promise<SupabaseSchemaInspection> {
  if (!supabase || !isSupabaseConfigured) return cachedSchema;

  try {
    let openApiDiscovered = false;

    // 1. Try querying PostgREST OpenAPI definition for instant full-schema reflection
    if (supabaseUrl && supabaseKey) {
      try {
        const rootUrl = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/`;
        const resp = await fetch(rootUrl, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/openapi+json, application/json'
          }
        });
        if (resp.ok) {
          const spec = await resp.json();
          // Support both OpenAPI 2.0 (spec.definitions) and OpenAPI 3.0 (spec.components.schemas)
          const defs = spec.definitions || spec.components?.schemas || {};
          for (const [rawTName, tDef] of Object.entries<any>(defs)) {
            if (tDef && tDef.properties) {
              const cols = new Set(Object.keys(tDef.properties));
              const normalizedName = rawTName.replace(/^public\./, '').replace(/^\//, '');
              tableColumnsMap.set(rawTName, cols);
              tableColumnsMap.set(normalizedName, cols);
            }
          }

          const prodCols = tableColumnsMap.get('products') || tableColumnsMap.get('public.products');
          if (prodCols && prodCols.size > 0) {
            cachedSchema.productColumns = prodCols;

            if (prodCols.has('base_price_per_kg')) {
              cachedSchema.hasBasePricePerKg = true;
              cachedSchema.basePriceColName = 'base_price_per_kg';
            } else if (prodCols.has('basePricePerKg')) {
              cachedSchema.hasBasePricePerKg = true;
              cachedSchema.basePriceColName = 'basePricePerKg';
            }

            if (prodCols.has('pricing_mode')) {
              cachedSchema.hasPricingMode = true;
              cachedSchema.pricingModeColName = 'pricing_mode';
            } else if (prodCols.has('pricingMode')) {
              cachedSchema.hasPricingMode = true;
              cachedSchema.pricingModeColName = 'pricingMode';
            }

            if (prodCols.has('weight_slabs')) {
              cachedSchema.hasWeightSlabs = true;
              cachedSchema.weightSlabsColName = 'weight_slabs';
            } else if (prodCols.has('weightSlabs')) {
              cachedSchema.hasWeightSlabs = true;
              cachedSchema.weightSlabsColName = 'weightSlabs';
            }

            cachedSchema.hasImages = prodCols.has('images');
            cachedSchema.hasImg = prodCols.has('img');
            cachedSchema.hasImage = prodCols.has('image');
            cachedSchema.hasImageUrl = prodCols.has('image_url');

            if (tableColumnsMap.has('payment_method_discounts') || tableColumnsMap.has('public.payment_method_discounts')) {
              cachedSchema.hasPaymentMethodDiscountsTable = true;
              cachedSchema.paymentMethodDiscountsTableName = 'payment_method_discounts';
            } else if (tableColumnsMap.has('paymentMethodDiscounts') || tableColumnsMap.has('public.paymentMethodDiscounts')) {
              cachedSchema.hasPaymentMethodDiscountsTable = true;
              cachedSchema.paymentMethodDiscountsTableName = 'paymentMethodDiscounts';
            }

            cachedSchema.hasPaymentTransactionsTable =
              tableColumnsMap.has('payment_transactions') ||
              tableColumnsMap.has('public.payment_transactions') ||
              tableColumnsMap.has('paymentTransactions');

            cachedSchema.hasPaymentAuditTrailTable =
              tableColumnsMap.has('payment_audit_trail') ||
              tableColumnsMap.has('public.payment_audit_trail') ||
              tableColumnsMap.has('paymentAuditTrail');

            cachedSchema.inspected = true;
            openApiDiscovered = true;
          }
        }
      } catch (e) {
        // Fall back to active PostgREST schema verification
      }
    }

    // 2. Active PostgREST Schema Verification
    // Queries PostgREST with limit(0) which verifies column existence in PostgreSQL schema cache
    // without needing sample rows or failing on empty tables.
    if (!openApiDiscovered || !cachedSchema.hasBasePricePerKg || !cachedSchema.hasWeightSlabs || !cachedSchema.hasPricingMode || !cachedSchema.hasImages) {
      // Products table sample or probe
      const { data: prodSample, error: prodErr } = await supabase.from('products').select('*').limit(1);
      if (!prodErr && prodSample && prodSample.length > 0) {
        const cols = new Set(Object.keys(prodSample[0]));
        cachedSchema.productColumns = cols;
        tableColumnsMap.set('products', cols);

        if (cols.has('base_price_per_kg')) {
          cachedSchema.hasBasePricePerKg = true;
          cachedSchema.basePriceColName = 'base_price_per_kg';
        } else if (cols.has('basePricePerKg')) {
          cachedSchema.hasBasePricePerKg = true;
          cachedSchema.basePriceColName = 'basePricePerKg';
        }

        if (cols.has('pricing_mode')) {
          cachedSchema.hasPricingMode = true;
          cachedSchema.pricingModeColName = 'pricing_mode';
        } else if (cols.has('pricingMode')) {
          cachedSchema.hasPricingMode = true;
          cachedSchema.pricingModeColName = 'pricingMode';
        }

        if (cols.has('weight_slabs')) {
          cachedSchema.hasWeightSlabs = true;
          cachedSchema.weightSlabsColName = 'weight_slabs';
        } else if (cols.has('weightSlabs')) {
          cachedSchema.hasWeightSlabs = true;
          cachedSchema.weightSlabsColName = 'weightSlabs';
        }

        if (cols.has('images')) cachedSchema.hasImages = true;
        if (cols.has('img')) cachedSchema.hasImg = true;
        if (cols.has('image')) cachedSchema.hasImage = true;
        if (cols.has('image_url')) cachedSchema.hasImageUrl = true;
      }

      // Explicit column probe for base price
      if (!cachedSchema.hasBasePricePerKg) {
        const { error: err1 } = await supabase.from('products').select('base_price_per_kg').limit(0);
        if (!err1) {
          cachedSchema.hasBasePricePerKg = true;
          cachedSchema.basePriceColName = 'base_price_per_kg';
          cachedSchema.productColumns.add('base_price_per_kg');
        } else {
          const { error: err2 } = await supabase.from('products').select('basePricePerKg').limit(0);
          if (!err2) {
            cachedSchema.hasBasePricePerKg = true;
            cachedSchema.basePriceColName = 'basePricePerKg';
            cachedSchema.productColumns.add('basePricePerKg');
          }
        }
      }

      // Explicit column probe for pricing mode
      if (!cachedSchema.hasPricingMode) {
        const { error: err1 } = await supabase.from('products').select('pricing_mode').limit(0);
        if (!err1) {
          cachedSchema.hasPricingMode = true;
          cachedSchema.pricingModeColName = 'pricing_mode';
          cachedSchema.productColumns.add('pricing_mode');
        } else {
          const { error: err2 } = await supabase.from('products').select('pricingMode').limit(0);
          if (!err2) {
            cachedSchema.hasPricingMode = true;
            cachedSchema.pricingModeColName = 'pricingMode';
            cachedSchema.productColumns.add('pricingMode');
          }
        }
      }

      // Explicit column probe for weight slabs
      if (!cachedSchema.hasWeightSlabs) {
        const { error: err1 } = await supabase.from('products').select('weight_slabs').limit(0);
        if (!err1) {
          cachedSchema.hasWeightSlabs = true;
          cachedSchema.weightSlabsColName = 'weight_slabs';
          cachedSchema.productColumns.add('weight_slabs');
        } else {
          const { error: err2 } = await supabase.from('products').select('weightSlabs').limit(0);
          if (!err2) {
            cachedSchema.hasWeightSlabs = true;
            cachedSchema.weightSlabsColName = 'weightSlabs';
            cachedSchema.productColumns.add('weightSlabs');
          }
        }
      }

      // Explicit column probe for images
      if (!cachedSchema.hasImages) {
        const { error: errImages } = await supabase.from('products').select('images').limit(0);
        if (!errImages) {
          cachedSchema.hasImages = true;
          cachedSchema.productColumns.add('images');
        }
      }

      // Image aliases probe
      if (!cachedSchema.hasImg) {
        const { error: errImg } = await supabase.from('products').select('img').limit(0);
        if (!errImg) {
          cachedSchema.hasImg = true;
          cachedSchema.productColumns.add('img');
        }
      }
      if (!cachedSchema.hasImage) {
        const { error: errImage } = await supabase.from('products').select('image').limit(0);
        if (!errImage) {
          cachedSchema.hasImage = true;
          cachedSchema.productColumns.add('image');
        }
      }
      if (!cachedSchema.hasImageUrl) {
        const { error: errImageUrl } = await supabase.from('products').select('image_url').limit(0);
        if (!errImageUrl) {
          cachedSchema.hasImageUrl = true;
          cachedSchema.productColumns.add('image_url');
        }
      }

      // Orders table
      const { data: orderSample, error: orderErr } = await supabase.from('orders').select('*').limit(1);
      if (!orderErr && orderSample && orderSample.length > 0) {
        tableColumnsMap.set('orders', new Set(Object.keys(orderSample[0])));
      }

      // Payment method discounts table (check both snake_case and camelCase)
      const { error: pmdErr1 } = await supabase.from('payment_method_discounts').select('id').limit(0);
      if (!pmdErr1) {
        cachedSchema.hasPaymentMethodDiscountsTable = true;
        cachedSchema.paymentMethodDiscountsTableName = 'payment_method_discounts';
      } else {
        const { error: pmdErr2 } = await supabase.from('paymentMethodDiscounts').select('id').limit(0);
        if (!pmdErr2) {
          cachedSchema.hasPaymentMethodDiscountsTable = true;
          cachedSchema.paymentMethodDiscountsTableName = 'paymentMethodDiscounts';
        } else {
          cachedSchema.hasPaymentMethodDiscountsTable = false;
        }
      }

      // Payment transactions table
      const { error: ptErr } = await supabase.from('payment_transactions').select('id').limit(0);
      cachedSchema.hasPaymentTransactionsTable = !ptErr;

      // Payment audit trail table
      const { error: patErr } = await supabase.from('payment_audit_trail').select('id').limit(0);
      cachedSchema.hasPaymentAuditTrailTable = !patErr;

      cachedSchema.inspected = true;
    }

    console.log('🔍 [Supabase Schema Diagnostic]:', {
      hasImg: cachedSchema.hasImg,
      hasImages: cachedSchema.hasImages,
      hasBasePricePerKg: cachedSchema.hasBasePricePerKg,
      hasPricingMode: cachedSchema.hasPricingMode,
      hasWeightSlabs: cachedSchema.hasWeightSlabs,
      hasPaymentMethodDiscounts: cachedSchema.hasPaymentMethodDiscountsTable,
      hasPaymentTransactions: cachedSchema.hasPaymentTransactionsTable,
      hasPaymentAuditTrail: cachedSchema.hasPaymentAuditTrailTable,
      inspected: cachedSchema.inspected
    });
  } catch (e) {
    console.warn('⚠️ Could not inspect Supabase schema:', e);
  }

  return cachedSchema;
}

/**
 * Startup Verification for Supabase Production Persistence
 * Verifies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY exist, tests connectivity,
 * runs auto-migration if DATABASE_URL is set, inspects schema, and logs clean status.
 */
export async function verifySupabaseConnection(): Promise<{
  isConfigured: boolean;
  hasUrl: boolean;
  hasServiceRoleKey: boolean;
  connected: boolean;
  message: string;
}> {
  const hasUrl = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_URL.startsWith('http') &&
    !process.env.SUPABASE_URL.includes('YOUR_SUPABASE')
  );
  const hasServiceRoleKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('YOUR_SUPABASE')
  );

  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

  if (!hasUrl || !hasServiceRoleKey) {
    const errorMsg = `Supabase configuration missing: SUPABASE_URL=${hasUrl ? 'CONFIGURED' : 'MISSING ❌'}, SUPABASE_SERVICE_ROLE_KEY=${hasServiceRoleKey ? 'CONFIGURED' : 'MISSING ❌'}`;
    if (isProduction) {
      console.error(`\n🚨 ==============================================================================`);
      console.error(`❌ [SERVER CONFIGURATION ERROR - SUPABASE PRODUCTION PERSISTENCE]`);
      console.error(`   ${errorMsg}`);
      console.error(`   In production/Render, Supabase is the permanent database.`);
      console.error(`   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Render environment.`);
      console.error(`==============================================================================\n`);
    } else {
      console.warn(`ℹ️ [Development Notice] ${errorMsg}. Running in hybrid development mode.`);
    }
    return {
      isConfigured: false,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: errorMsg
    };
  }

  if (!supabase) {
    return {
      isConfigured: false,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: 'Supabase client failed to initialize'
    };
  }

  try {
    // 1. Attempt direct PostgreSQL migration if connection string is provided
    await runDirectPostgresMigration();

    // 2. Test basic table connectivity
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      const errText = error.message;
      if (errText.includes('relation') || errText.includes('does not exist')) {
        console.log('✅ Supabase production database connected successfully (tables ready for initialization).');
        await inspectSupabaseSchema();
        return {
          isConfigured: true,
          hasUrl,
          hasServiceRoleKey,
          connected: true,
          message: 'Supabase production database connected successfully.'
        };
      }
      console.error(`❌ Supabase connection test failed: ${errText}`);
      return {
        isConfigured: true,
        hasUrl,
        hasServiceRoleKey,
        connected: false,
        message: `Supabase query failed: ${errText}`
      };
    }

    // 3. Inspect schema structure
    await inspectSupabaseSchema();

    console.log('✅ Supabase production database connected successfully.');
    return {
      isConfigured: true,
      hasUrl,
      hasServiceRoleKey,
      connected: true,
      message: 'Supabase production database connected successfully.'
    };
  } catch (err: any) {
    console.error(`❌ Supabase connection exception:`, err.message || err);
    return {
      isConfigured: true,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: err.message || 'Connection exception'
    };
  }
}

/**
 * Persist product including weight slabs, base price per kg, images, and pricing mode
 */
export function normalizeProductFromDb(p: any) {
  if (!p) return null;
  const isKg = isKgProduct(p);
  const unit = p.unit !== undefined && p.unit !== null && String(p.unit).trim() !== ''
    ? String(p.unit).toLowerCase().trim()
    : (isKg ? 'kg' : 'piece');

  const sp = Number(
    p.sp !== undefined && p.sp !== null
      ? p.sp
      : (p.base_price_per_kg !== undefined && p.base_price_per_kg !== null
          ? p.base_price_per_kg
          : (p.basePricePerKg !== undefined && p.basePricePerKg !== null ? p.basePricePerKg : 0))
  );

  const basePricePerKg = Number(
    p.base_price_per_kg !== null && p.base_price_per_kg !== undefined
      ? p.base_price_per_kg
      : (p.basePricePerKg !== null && p.basePricePerKg !== undefined ? p.basePricePerKg : sp)
  );

  const rawSlabs = isKg
    ? (Array.isArray(p.weight_slabs) ? p.weight_slabs : (Array.isArray(p.weightSlabs) ? p.weightSlabs : []))
    : [];

  let rawImages: any[] = [];
  if (Array.isArray(p.images)) {
    rawImages = p.images;
  } else if (typeof p.images === 'string' && p.images.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(p.images);
      if (Array.isArray(parsed)) rawImages = parsed;
    } catch {}
  } else if (Array.isArray(p.image)) {
    rawImages = p.image;
  }

  // Resolve primary image from all column aliases
  let img = String(p.img || p.image || p.image_url || '').trim();
  if (!img && rawImages.length > 0) {
    const first = rawImages[0];
    img = String(typeof first === 'string' ? first : (first?.url || '')).trim();
  }

  // If img is present but rawImages is empty, synthesize a single Cover image item
  if (img && rawImages.length === 0) {
    rawImages = [{ id: `img_${p.id}_0`, url: img, tag: 'Cover', isConfirmed: true, isMatch: true }];
  }

  return {
    id: Number(p.id),
    name: p.name || '',
    cat: p.cat || 'all',
    type: p.type || 'organic',
    cp: Number(p.cp || 0),
    sp,
    basePricePerKg,
    base_price_per_kg: basePricePerKg,
    unit,
    weight: p.weight || (isKg ? 'per kg' : `per ${unit}`),
    discount: p.discount || '',
    img,
    image: img,
    image_url: img,
    images: rawImages,
    emoji: p.emoji || '🥬',
    rating: Number(p.rating || 5.0),
    reviews: Number(p.reviews || 0),
    stockQty: Number(p.stock_qty !== undefined ? p.stock_qty : (p.stockQty !== undefined ? p.stockQty : 50)),
    reservedQty: Number(p.reserved_qty !== undefined ? p.reserved_qty : (p.reservedQty !== undefined ? p.reservedQty : 0)),
    lowAt: Number(p.low_at !== undefined ? p.low_at : (p.lowAt !== undefined ? p.lowAt : 10)),
    weightSlabs: rawSlabs,
    weight_slabs: rawSlabs,
    pricingMode: isKg ? (p.pricing_mode || p.pricingMode || (rawSlabs.length > 0 ? 'slabs' : 'auto')) : 'auto',
    description: p.description || ''
  };
}

export async function updateProductInSupabase(
  productId: number,
  updates: any
): Promise<{ success: boolean; product?: any; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { success: false, error: 'Supabase database is not configured' };
  }

  try {
    const id = Number(productId);
    if (isNaN(id) || id <= 0) {
      return { success: false, error: `Invalid product ID: ${productId}` };
    }

    const isKg = isKgProduct(updates);
    const rawSlabs = Array.isArray(updates.weightSlabs)
      ? updates.weightSlabs
      : (Array.isArray(updates.weight_slabs) ? updates.weight_slabs : undefined);
    const slabs = rawSlabs !== undefined ? (isKg ? rawSlabs : []) : undefined;

    const resolvedBasePrice = updates.basePricePerKg !== undefined
      ? Number(updates.basePricePerKg)
      : (updates.base_price_per_kg !== undefined
          ? Number(updates.base_price_per_kg)
          : (updates.sp !== undefined ? Number(updates.sp) : undefined));

    const incomingImg = updates.img !== undefined
      ? updates.img
      : (updates.image !== undefined ? updates.image : updates.image_url);
    let finalImg = incomingImg !== undefined ? String(incomingImg).trim() : undefined;
    let finalImages = Array.isArray(updates.images)
      ? [...updates.images]
      : (Array.isArray(updates.image) ? [...updates.image] : undefined);

    if (finalImg !== undefined && (!finalImages || finalImages.length === 0)) {
      finalImages = finalImg ? [{ id: `img_${id}_0`, url: finalImg, tag: 'Cover', isConfirmed: true, isMatch: true }] : [];
    } else if (finalImages && finalImages.length > 0 && finalImg === undefined) {
      const first = finalImages[0];
      finalImg = typeof first === 'string' ? first.trim() : (first?.url || '').trim();
    } else if (finalImg !== undefined && finalImages && finalImages.length > 0) {
      if (typeof finalImages[0] === 'string') {
        finalImages[0] = finalImg;
      } else if (finalImages[0] && typeof finalImages[0] === 'object') {
        finalImages[0] = { ...finalImages[0], url: finalImg };
      }
    }

    const row: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) row.name = String(updates.name).trim();
    if (updates.cat !== undefined) row.cat = String(updates.cat).trim();
    if (updates.type !== undefined) row.type = String(updates.type).trim();
    if (updates.cp !== undefined) row.cp = Number(updates.cp);
    if (updates.sp !== undefined) row.sp = Number(updates.sp);
    if (updates.unit !== undefined) row.unit = String(updates.unit).trim();
    if (updates.weight !== undefined) row.weight = String(updates.weight).trim();
    if (updates.discount !== undefined) row.discount = String(updates.discount).trim();
    if (updates.emoji !== undefined) row.emoji = String(updates.emoji).trim();
    if (updates.rating !== undefined) row.rating = Number(updates.rating);
    if (updates.reviews !== undefined) row.reviews = Number(updates.reviews);
    if (updates.stockQty !== undefined || updates.stock_qty !== undefined) {
      row.stock_qty = Number(updates.stockQty !== undefined ? updates.stockQty : updates.stock_qty);
    }
    if (updates.lowAt !== undefined || updates.low_at !== undefined) {
      row.low_at = Number(updates.lowAt !== undefined ? updates.lowAt : updates.low_at);
    }
    if (updates.description !== undefined) row.description = String(updates.description).trim();

    // IMAGE FIELD HANDLING:
    // `img` is the primary and canonical column in Supabase PostgreSQL! Always set `img`
    if (finalImg !== undefined) {
      if (cachedSchema.hasImg || !cachedSchema.inspected) row.img = finalImg;
      if (cachedSchema.hasImage) row.image = finalImg;
      if (cachedSchema.hasImageUrl) row.image_url = finalImg;
    }
    if (finalImages !== undefined && cachedSchema.hasImages) {
      row.images = finalImages;
    }

    // Extended columns only if they exist in Supabase schema:
    if (resolvedBasePrice !== undefined && cachedSchema.hasBasePricePerKg) {
      const col = cachedSchema.basePriceColName || 'base_price_per_kg';
      row[col] = resolvedBasePrice;
    }
    if (slabs !== undefined && cachedSchema.hasWeightSlabs) {
      const col = cachedSchema.weightSlabsColName || 'weight_slabs';
      row[col] = slabs;
    }
    if ((updates.pricingMode !== undefined || updates.pricing_mode !== undefined) && cachedSchema.hasPricingMode) {
      const col = cachedSchema.pricingModeColName || 'pricing_mode';
      row[col] = updates.pricingMode || updates.pricing_mode;
    }

    // Perform Supabase UPDATE on the exact product row with automatic column adaptation
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Remove any known missing columns for products
      const knownMissing = tableMissingColumnsMap.get('products');
      if (knownMissing) {
        for (const col of knownMissing) {
          delete row[col];
        }
      }
      if (!cachedSchema.hasBasePricePerKg) {
        delete row.base_price_per_kg;
        delete row.basePricePerKg;
      }
      if (!cachedSchema.hasWeightSlabs) {
        delete row.weight_slabs;
        delete row.weightSlabs;
      }
      if (!cachedSchema.hasPricingMode) {
        delete row.pricing_mode;
        delete row.pricingMode;
      }
      if (!cachedSchema.hasImages) delete row.images;

      const { data, error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select('*');

      if (!error) {
        if (!data || data.length === 0) {
          console.warn(`[Supabase UPDATE] Product #${id} not found to update, inserting product row into products table...`);
          const insertRow = { id, ...row };
          const { data: insertedData, error: insertError } = await supabase
            .from('products')
            .upsert(insertRow, { onConflict: 'id' })
            .select('*');
          if (insertError) {
            console.warn(`[Supabase Upsert Warning] Product #${id}:`, insertError.message);
            return { success: false, error: insertError.message };
          }
          if (insertedData && insertedData.length > 0) {
            const normalized = normalizeProductFromDb(insertedData[0]);
            return {
              success: true,
              product: {
                ...normalized,
                img: finalImg !== undefined ? finalImg : normalized.img,
                image: finalImg !== undefined ? finalImg : normalized.image,
                image_url: finalImg !== undefined ? finalImg : normalized.image_url,
                images: finalImages && finalImages.length > 0 ? finalImages : normalized.images,
                basePricePerKg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized.basePricePerKg,
                base_price_per_kg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized.base_price_per_kg,
                weightSlabs: slabs !== undefined ? slabs : normalized.weightSlabs,
                weight_slabs: slabs !== undefined ? slabs : normalized.weight_slabs,
                pricingMode: updates.pricingMode || updates.pricing_mode || normalized.pricingMode
              }
            };
          }
        }
        const returnedRow = data[0];
        const normalized = normalizeProductFromDb(returnedRow);
        const mergedProduct = {
          ...normalized,
          img: finalImg !== undefined ? finalImg : normalized.img,
          image: finalImg !== undefined ? finalImg : normalized.image,
          image_url: finalImg !== undefined ? finalImg : normalized.image_url,
          images: finalImages && finalImages.length > 0 ? finalImages : normalized.images,
          basePricePerKg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized.basePricePerKg,
          base_price_per_kg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized.base_price_per_kg,
          weightSlabs: slabs !== undefined ? slabs : normalized.weightSlabs,
          weight_slabs: slabs !== undefined ? slabs : normalized.weight_slabs,
          pricingMode: updates.pricingMode || updates.pricing_mode || normalized.pricingMode
        };

        console.log(`✅ [Supabase UPDATE Verified] Product #${id} successfully updated:`, {
          id: mergedProduct.id,
          name: mergedProduct.name,
          img: mergedProduct.img,
          sp: mergedProduct.sp,
          stockQty: mergedProduct.stockQty
        });
        return { success: true, product: mergedProduct };
      }

      const match = error.message
        ? error.message.match(/Could not find the '([^']+)' column/i) ||
          error.message.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
          error.message.match(/column "([^"]+)" does not exist/i)
        : null;

      if (match && match[1]) {
        const missingCol = match[1];
        if (!tableMissingColumnsMap.has('products')) {
          tableMissingColumnsMap.set('products', new Set());
        }
        tableMissingColumnsMap.get('products')!.add(missingCol);
        cachedSchema.productColumns.delete(missingCol);
        if (missingCol === 'base_price_per_kg' || missingCol === 'basePricePerKg') cachedSchema.hasBasePricePerKg = false;
        if (missingCol === 'images') cachedSchema.hasImages = false;
        if (missingCol === 'pricing_mode' || missingCol === 'pricingMode') cachedSchema.hasPricingMode = false;
        if (missingCol === 'weight_slabs' || missingCol === 'weightSlabs') cachedSchema.hasWeightSlabs = false;
        if (missingCol === 'img') cachedSchema.hasImg = false;
        if (missingCol === 'image') cachedSchema.hasImage = false;
        if (missingCol === 'image_url') cachedSchema.hasImageUrl = false;
        delete row[missingCol];

        console.info(`ℹ️ [Supabase Product Adaptation] Column '${missingCol}' not present in remote products schema. Stripping and retrying update...`);
        continue;
      }

      console.warn(`[Supabase UPDATE Warning] Product #${id}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Maximum retry attempts exceeded updating product' };
  } catch (err: any) {
    console.error('Exception in updateProductInSupabase:', err);
    return { success: false, error: err.message || 'Unknown database error' };
  }
}

export async function syncProductToSupabase(product: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const isKg = isKgProduct(product);
    const rawSlabs = Array.isArray(product.weightSlabs)
      ? product.weightSlabs
      : (Array.isArray(product.weight_slabs) ? product.weight_slabs : []);
    const slabs = isKg ? rawSlabs : [];

    const resolvedBasePrice = Number(
      product.basePricePerKg !== undefined
        ? product.basePricePerKg
        : (product.base_price_per_kg !== undefined ? product.base_price_per_kg : product.sp)
    );

    const imgUrl = String(product.img || product.image || product.image_url || '').trim();
    const imagesArr = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : (imgUrl ? [{ id: `img_${product.id}_0`, url: imgUrl, tag: 'Cover', isConfirmed: true, isMatch: true }] : []);

    const row: Record<string, any> = {
      id: Number(product.id),
      name: product.name,
      cat: product.cat,
      type: product.type || 'organic',
      cp: Number(product.cp || 0),
      sp: Number(product.sp || resolvedBasePrice),
      unit: product.unit || (isKg ? 'kg' : 'piece'),
      weight: product.weight || (isKg ? 'per kg' : 'per piece'),
      discount: product.discount || '',
      img: imgUrl,
      emoji: product.emoji || '🥬',
      rating: Number(product.rating || 5.0),
      reviews: Number(product.reviews || 0),
      stock_qty: Number(product.stockQty !== undefined ? product.stockQty : (product.stock_qty !== undefined ? product.stock_qty : 50)),
      low_at: Number(product.lowAt !== undefined ? product.lowAt : (product.low_at !== undefined ? product.low_at : 10)),
      description: product.description || ''
    };

    if (cachedSchema.hasImg || !cachedSchema.inspected) row.img = imgUrl;
    if (cachedSchema.hasImage) row.image = imgUrl;
    if (cachedSchema.hasImageUrl) row.image_url = imgUrl;
    if (cachedSchema.hasImages) row.images = imagesArr;
    if (cachedSchema.hasBasePricePerKg) {
      const col = cachedSchema.basePriceColName || 'base_price_per_kg';
      row[col] = resolvedBasePrice;
    }
    if (cachedSchema.hasWeightSlabs) {
      const col = cachedSchema.weightSlabsColName || 'weight_slabs';
      row[col] = slabs;
    }
    if (cachedSchema.hasPricingMode) {
      const col = cachedSchema.pricingModeColName || 'pricing_mode';
      row[col] = isKg ? (product.pricingMode || product.pricing_mode || (slabs.length > 0 ? 'slabs' : 'auto')) : 'auto';
    }

    return await upsertTable('products', row, 'id');
  } catch (err) {
    console.error('Error syncing product to Supabase:', err);
    return false;
  }
}

/**
 * Directly sync a single order to Supabase PostgreSQL with historical item price snapshot
 */
export async function syncOrderToSupabase(order: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const uId = (order.userId && order.userId !== 'guest') ? String(order.userId) : null;
    const normalizedItems = (order.items || []).map((it: any) => ({
      id: it.id,
      name: it.name || it.vegetableName || '',
      vegetableName: it.vegetableName || it.name || '',
      weight: it.weight || it.weightLabel || '',
      weightLabel: it.weightLabel || it.weight || '',
      weightInGrams: Number(it.weightInGrams !== undefined ? it.weightInGrams : (it.weight_in_grams || 0)),
      weight_in_grams: Number(it.weightInGrams !== undefined ? it.weightInGrams : (it.weight_in_grams || 0)),
      pricingType: it.pricingType || it.pricing_type || 'base_rate',
      pricing_type: it.pricingType || it.pricing_type || 'base_rate',
      actualPurchasedPrice: Number(it.actualPurchasedPrice !== undefined ? it.actualPurchasedPrice : (it.price !== undefined ? it.price : it.sp || 0)),
      actual_purchased_price: Number(it.actualPurchasedPrice !== undefined ? it.actualPurchasedPrice : (it.price !== undefined ? it.price : it.sp || 0)),
      quantity: Number(it.quantity !== undefined ? it.quantity : (it.qty || 1)),
      qty: Number(it.quantity !== undefined ? it.quantity : (it.qty || 1)),
      itemTotal: Number(it.itemTotal !== undefined ? it.itemTotal : (it.lineTotal || 0)),
      item_total: Number(it.itemTotal !== undefined ? it.itemTotal : (it.lineTotal || 0)),
      emoji: it.emoji || '🥬',
      img: it.img || '',
      formulaText: it.formulaText || ''
    }));

    const row = {
      id: String(order.id),
      user_id: uId,
      customer_id: String(order.userId || 'guest'),
      user_email: order.userEmail || '',
      user_name: order.userName || order.customerName || 'Customer',
      items: normalizedItems,
      subtotal: Number(order.subtotal || 0),
      delivery: Number(order.delivery || 0),
      discount_applied: Number(order.discountApplied || 0),
      coupon_applied: order.couponApplied || '',
      total: Number(order.total || 0),
      payment: order.payment || 'COD',
      payment_status: order.paymentStatus || 'Pending',
      utr_number: order.razorpayPaymentId || order.utrNumber || order.utr || order.transactionId || '',
      utr: order.razorpayPaymentId || order.utrNumber || order.utr || order.transactionId || '',
      upi_id_used: order.upiIdUsed || '',
      payment_screenshot: order.paymentScreenshot || order.screenshotUrl || '',
      payment_discount_method: order.paymentDiscountMethod || null,
      payment_discount_type: order.paymentDiscountType || null,
      payment_discount_value: order.paymentDiscountValue !== undefined ? Number(order.paymentDiscountValue) : null,
      payment_discount_amount: Number(order.paymentDiscountAmount || 0),
      payment_discount_label: order.paymentDiscountLabel || null,
      total_discount: Number(order.totalDiscount || (order.discountApplied || 0) + (order.paymentDiscountAmount || 0)),
      status: order.status || 'New Orders',
      admin_remarks: order.adminRemarks || '',
      assigned_rider: order.assignedRider || '',
      payment_gateway: order.paymentGateway || (order.razorpayPaymentId ? 'razorpay' : (order.upiIdUsed ? 'upi' : 'cod')),
      refund_amount: Number(order.refundAmount || 0),
      refund_history: order.refundHistory || [],
      payment_audit_trail: order.paymentAuditTrail || [],
      stock_deducted: Boolean(order.stockDeducted !== false),
      stock_released: Boolean(order.stockReleased === true),
      idempotency_key: order.idempotencyKey || null,
      razorpay_order_id: order.razorpayOrderId || null,
      razorpay_payment_id: order.razorpayPaymentId || null,
      razorpay_signature: order.razorpaySignature || null,
      address: order.address || '',
      phone: order.phone || '',
      created_at: order.createdAt || new Date().toISOString(),
      updated_at: order.updatedAt || new Date().toISOString(),
      cancellation_reason: order.cancellationReason || '',
      cancelled_at: order.cancelledAt || null,
      refunded_at: order.refundedAt || null,
      refund_note: order.refundNote || '',
      cashier: order.cashier || 'Online Order'
    };

    const ok = await upsertTable('orders', row, 'id');
    if (!ok && row.user_id) {
      // Retry without user_id foreign key constraint in case user record was not synced
      const fallbackRow = { ...row, user_id: null };
      return await upsertTable('orders', fallbackRow, 'id');
    }
    return ok;
  } catch (err) {
    console.error('Error syncing order to Supabase:', err);
    return false;
  }
}

/**
 * Sync payment transaction record to Supabase
 */
export async function syncPaymentTransactionToSupabase(txn: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  if (cachedSchema.inspected && cachedSchema.hasPaymentTransactionsTable === false) {
    return false;
  }
  try {
    const row = {
      id: String(txn.id),
      order_id: String(txn.orderId || txn.order_id),
      user_id: txn.userId || txn.user_id || null,
      user_email: txn.userEmail || txn.user_email || '',
      amount: Number(txn.amount || 0),
      currency: txn.currency || 'INR',
      gateway: txn.gateway || 'unknown',
      status: txn.status || 'Pending',
      transaction_id: txn.transactionId || txn.transaction_id || null,
      utr: txn.utr || null,
      razorpay_order_id: txn.razorpayOrderId || txn.razorpay_order_id || null,
      razorpay_payment_id: txn.razorpayPaymentId || txn.razorpay_payment_id || null,
      admin_notes: txn.adminNotes || txn.admin_notes || '',
      created_at: txn.createdAt || txn.created_at || new Date().toISOString()
    };
    return await upsertTable('payment_transactions', row, 'id');
  } catch (err) {
    console.error('Error syncing payment transaction to Supabase:', err);
    return false;
  }
}

/**
 * Sync payment audit trail entry to Supabase
 */
export async function syncPaymentAuditToSupabase(audit: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  if (cachedSchema.inspected && cachedSchema.hasPaymentAuditTrailTable === false) {
    return false;
  }
  try {
    const row = {
      id: String(audit.id),
      order_id: String(audit.orderId || audit.order_id),
      performed_by: audit.performedBy || audit.performed_by || 'system',
      previous_status: audit.previousStatus || audit.previous_status || null,
      new_status: audit.newStatus || audit.new_status,
      amount: audit.amount !== undefined && audit.amount !== null ? Number(audit.amount) : null,
      reason: audit.reason || '',
      metadata: audit.metadata || {},
      created_at: audit.createdAt || audit.created_at || new Date().toISOString()
    };
    return await upsertTable('payment_audit_trail', row, 'id');
  } catch (err) {
    console.warn('Notice: payment_audit_trail sync skipped or error:', err);
    return false;
  }
}

/**
 * Upload file buffer directly to Supabase Storage bucket
 */
export async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  try {
    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some(b => b.name === bucketName)) {
      await supabase.storage.createBucket(bucketName, { public: true });
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error(`Error uploading file to Supabase storage bucket "${bucketName}":`, error.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Failed uploading file to Supabase storage:', err);
    return null;
  }
}

/**
 * Generic fetcher with automatic fallback to local memory
 */
export async function fetchTable<T>(
  tableName: string,
  memoryFallback: T[],
  transformRow?: (row: any) => T
): Promise<T[]> {
  if (!supabase || !isSupabaseConfigured) {
    return memoryFallback;
  }

  try {
    let resolvedTable = tableName;
    if (tableName === 'payment_method_discounts') {
      if (cachedSchema.inspected && !cachedSchema.hasPaymentMethodDiscountsTable) {
        return memoryFallback;
      }
      if (cachedSchema.paymentMethodDiscountsTableName) {
        resolvedTable = cachedSchema.paymentMethodDiscountsTableName;
      }
    }

    const { data, error } = await supabase.from(resolvedTable).select('*');
    if (error) {
      if (tableName === 'payment_method_discounts' && resolvedTable === 'payment_method_discounts') {
        const { data: camelData, error: camelErr } = await supabase.from('paymentMethodDiscounts').select('*');
        if (!camelErr && camelData && camelData.length > 0) {
          cachedSchema.hasPaymentMethodDiscountsTable = true;
          cachedSchema.paymentMethodDiscountsTableName = 'paymentMethodDiscounts';
          return transformRow ? camelData.map(transformRow) : (camelData as T[]);
        }
      }
      return memoryFallback;
    }

    if (data && data.length > 0) {
      if (transformRow) {
        return data.map(transformRow);
      }
      return data as T[];
    }
  } catch (err) {
    // Gracefully fallback to memory
  }

  return memoryFallback;
}

/**
 * Upsert records into Supabase PostgreSQL table safely
 */
export async function upsertTable(
  tableName: string,
  records: any | any[],
  onConflictColumn?: string
): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    let payload = Array.isArray(records) ? records : [records];
    if (payload.length === 0) return true;

    // Check table availability before querying
    let targetTable = tableName;
    if (tableName === 'payment_method_discounts') {
      if (cachedSchema.inspected && !cachedSchema.hasPaymentMethodDiscountsTable) {
        return false;
      }
      if (cachedSchema.paymentMethodDiscountsTableName) {
        targetTable = cachedSchema.paymentMethodDiscountsTableName;
      }
    }

    const maxRetries = 15;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const allowedCols = tableColumnsMap.get(targetTable) || tableColumnsMap.get(tableName);
      const knownMissing = tableMissingColumnsMap.get(targetTable) || tableMissingColumnsMap.get(tableName);

      // Clean payload against discovered column whitelist or known missing columns
      let cleanPayload = payload.map(row => {
        const cleanRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (allowedCols && allowedCols.size > 0) {
            if (allowedCols.has(key) || key === onConflictColumn) {
              cleanRow[key] = value;
            }
          } else {
            if (!knownMissing || !knownMissing.has(key)) {
              cleanRow[key] = value;
            }
          }
        }
        return cleanRow;
      });

      // Strict enforcement for products table
      if (tableName === 'products') {
        cleanPayload = cleanPayload.map(row => {
          const r = { ...row };
          if (!cachedSchema.hasBasePricePerKg) {
            delete r.base_price_per_kg;
            delete r.basePricePerKg;
          }
          if (!cachedSchema.hasWeightSlabs) {
            delete r.weight_slabs;
            delete r.weightSlabs;
          }
          if (!cachedSchema.hasPricingMode) {
            delete r.pricing_mode;
            delete r.pricingMode;
          }
          if (!cachedSchema.hasImages) delete r.images;
          if (!cachedSchema.hasImage) delete r.image;
          if (!cachedSchema.hasImageUrl) delete r.image_url;
          return r;
        });
      }

      const options = onConflictColumn ? { onConflict: onConflictColumn } : undefined;
      const { error } = await supabase.from(targetTable).upsert(cleanPayload, options);

      if (!error) return true;

      const errorMsg = error.message || '';
      const match =
        errorMsg.match(/Could not find the '([^']+)' column/i) ||
        errorMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
        errorMsg.match(/column "([^"]+)" does not exist/i);

      if (match && match[1]) {
        const missingCol = match[1];
        if (!tableMissingColumnsMap.has(tableName)) {
          tableMissingColumnsMap.set(tableName, new Set());
        }
        tableMissingColumnsMap.get(tableName)!.add(missingCol);

        if (tableColumnsMap.has(tableName)) {
          tableColumnsMap.get(tableName)!.delete(missingCol);
        }

        if (tableName === 'products') {
          cachedSchema.productColumns.delete(missingCol);
          if (missingCol === 'base_price_per_kg') cachedSchema.hasBasePricePerKg = false;
          if (missingCol === 'images') cachedSchema.hasImages = false;
          if (missingCol === 'pricing_mode') cachedSchema.hasPricingMode = false;
          if (missingCol === 'weight_slabs') cachedSchema.hasWeightSlabs = false;
          if (missingCol === 'image') cachedSchema.hasImage = false;
          if (missingCol === 'image_url') cachedSchema.hasImageUrl = false;
        }

        // Strip this column from all original payload rows and retry
        payload = payload.map(row => {
          const c = { ...row };
          delete c[missingCol];
          return c;
        });

        console.info(`ℹ️ [Supabase Schema Adaptation] Table '${tableName}' does not have column '${missingCol}'. Stripping and retrying upsert...`);
        continue;
      }

      // Foreign key violation check (e.g., user_id in orders or notifications)
      if (errorMsg.includes('foreign key constraint') || errorMsg.includes('violates foreign key')) {
        let hasUserId = false;
        payload = payload.map(row => {
          if (row.user_id) {
            hasUserId = true;
            return { ...row, user_id: null };
          }
          return row;
        });
        if (hasUserId) {
          continue;
        }
      }

      if (errorMsg.includes('relation') && errorMsg.includes('does not exist')) {
        console.warn(`[Supabase Notice] Table '${tableName}' does not exist in remote Supabase schema.`);
        return false;
      }

      console.warn(`[Supabase Upsert Warning] Table '${tableName}':`, errorMsg);
      return false;
    }

    return false;
  } catch (err) {
    console.error(`[Supabase Upsert Exception] Table '${tableName}':`, err);
    return false;
  }
}

/**
 * Delete records from Supabase PostgreSQL table
 */
export async function deleteFromTable(
  tableName: string,
  matchColumn: string,
  matchValue: any
): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const { error } = await supabase.from(tableName).delete().eq(matchColumn, matchValue);
    if (error) {
      console.error(`[Supabase Delete Error] Table '${tableName}':`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Supabase Delete Exception] Table '${tableName}':`, err);
    return false;
  }
}
