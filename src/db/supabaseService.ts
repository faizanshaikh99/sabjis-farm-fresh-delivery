import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isKgProduct } from '../utils/weightParser';

export type DatabaseErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'SUPABASE_UNAVAILABLE'
  | 'CONSTRAINT_ERROR'
  | 'DATABASE_ERROR';

export class DatabaseError extends Error {
  statusCode: number;
  code: DatabaseErrorCode;
  tableName?: string;
  details?: string;

  constructor(
    message: string,
    statusCode: number = 503,
    code: DatabaseErrorCode = 'SUPABASE_UNAVAILABLE',
    tableName?: string,
    details?: string
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = statusCode;
    this.code = code;
    this.tableName = tableName;
    this.details = details;
  }
}

export function isDatabaseError(err: any): err is DatabaseError {
  return Boolean(err && (err instanceof DatabaseError || err.name === 'DatabaseError'));
}

export const tableColumnsMap: Map<string, Set<string>> = new Map();
export const tableMissingColumnsMap: Map<string, Set<string>> = new Map([
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
  hasSoldQty: boolean;
  hasReservedQty: boolean;
  hasPaymentMethodDiscountsTable: boolean;
  paymentMethodDiscountsTableName: 'payment_method_discounts' | 'paymentMethodDiscounts' | null;
  hasPaymentTransactionsTable: boolean;
  hasPaymentAuditTrailTable: boolean;
  inspected: boolean;
}

function createDefaultSchemaState(): SupabaseSchemaInspection {
  return {
    productColumns: new Set([
      'id', 'name', 'cat', 'type', 'cp', 'sp', 'unit', 'weight', 'discount',
      'img', 'emoji', 'rating', 'reviews', 'stock_qty', 'reserved_qty', 'sold_qty',
      'low_at', 'description', 'created_at', 'updated_at'
    ]),
    hasBasePricePerKg: true,
    basePriceColName: 'base_price_per_kg',
    hasImages: true,
    hasPricingMode: true,
    pricingModeColName: 'pricing_mode',
    hasWeightSlabs: true,
    weightSlabsColName: 'weight_slabs',
    hasImg: true,
    hasImage: true,
    hasImageUrl: true,
    hasSoldQty: true,
    hasReservedQty: true,
    hasPaymentMethodDiscountsTable: true,
    paymentMethodDiscountsTableName: 'payment_method_discounts',
    hasPaymentTransactionsTable: true,
    hasPaymentAuditTrailTable: true,
    inspected: false
  };
}

export let cachedSchema: SupabaseSchemaInspection = createDefaultSchemaState();

/**
 * Standard Column Whitelists for Supabase Table Queries
 */
export const TABLE_SELECT_COLUMNS: Record<string, string> = {
  products: 'id,name,cat,type,cp,sp,unit,weight,discount,img,image,image_url,images,emoji,rating,reviews,stock_qty,reserved_qty,sold_qty,low_at,base_price_per_kg,pricing_mode,weight_slabs,description,created_at,updated_at',
  orders: 'id,user_id,customer_id,user_email,user_name,items,subtotal,delivery,discount_applied,coupon_applied,payment_discount_method,payment_discount_type,payment_discount_value,payment_discount_amount,payment_discount_label,payment_discount_min_order,payment_discount_max_discount,total_discount,total,payment,payment_status,payment_gateway,utr,utr_number,upi_id_used,payment_screenshot,razorpay_order_id,razorpay_payment_id,razorpay_signature,idempotency_key,stock_deducted,stock_reserved,stock_released,inventory_status,stock_released_at,stock_release_reason,payment_audit_trail,refund_history,refund_amount,refund_id,refund_status,refund_reason,status,admin_remarks,assigned_rider,delivery_instructions,address,phone,created_at,updated_at,cancellation_reason,cancelled_at,refunded_at,refund_note,cashier',
  users: 'id,name,email,phone,password,role,permissions,status,addresses,joined_at,must_change_password,created_at,updated_at',
  offers: 'id,title,desc_text,tag,tag_color,img,created_at',
  reviews: 'id,author_name,location,rating,body,created_at',
  coupons: 'code,discount,min_order,max_discount,usage,type,expiry,max_per_customer,max_redemptions,campaign_type,status,start_date,campaign_name,ig_post_url,ig_reel_url,ig_story_link,campaign_notes,internal_description,created_date,created_at',
  categories: 'id,label,emoji,name,created_at',
  addresses: 'id,user_id,name,label,flat,street,area,pin,city,state,landmark,is_default,created_at',
  sessions: 'id,user_id,token,created_at,expires_at,device,ip',
  payment_method_discounts: 'id,payment_method,payment_method_name,discount_type,discount_value,min_order,max_discount,start_date,end_date,status,created_at,updated_at',
  payment_transactions: 'id,order_id,user_id,user_email,amount,currency,gateway,status,transaction_id,utr,razorpay_order_id,razorpay_payment_id,admin_notes,created_at',
  payment_audit_trail: 'id,order_id,performed_by,previous_status,new_status,amount,reason,metadata,created_at',
  password_resets: 'id,user_id,email,phone,name,reason,status,requested_at,updated_at,approved_at,approved_by,admin_notes,temp_password_hash,temp_password,token,expires_at,notification_status,last_login,device_info,ip,audit_trail,attempts,max_attempts,cooldown_until,verified_at,verification_token,verification_token_expires_at,channel,used',
  business_settings: 'id,min_free_delivery,standard_shipping,gst_percentage,operational_hours_start,operational_hours_end,is_open,support_phone,address,business_name,support_email,website,gst_number,fssai_license,business_registration_number,enable_ig_banner,ig_profile_url,ig_banner_text,updated_at',
  payment_settings: 'id,business_name,upi_id,qr_code_url,qr_code_data_url,qr_code_file_name,qr_code_uploaded,qr_code_uploaded_at,instructions,enable_upi,enable_cod,enable_razorpay,auto_approve_upi,updated_at',
  notifications: 'id,user_id,title,body,type,read,created_at',
  login_history: 'id,user_id,identifier,status,ip,user_agent,timestamp',
  redemption_logs: 'id,user_id,user_email,coupon_code,code,order_id,discount_amount,timestamp',
  audit_logs: 'id,action,performed_by,user_id,details,timestamp'
};

// Safely ensure .env variables are loaded in Node.js runtime
function loadEnvironmentVariables() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(envPath);
      } catch {}
    }
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
    } catch {}
  }
}

loadEnvironmentVariables();

export let supabase: SupabaseClient | null = null;
export let isSupabaseConfigured = false;
const inFlightTableFetches = new Map<string, Promise<any>>();

export function initSupabaseFromEnv() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (
    supabaseUrl &&
    serviceRoleKey &&
    !supabaseUrl.includes('YOUR_SUPABASE') &&
    !serviceRoleKey.includes('YOUR_SUPABASE') &&
    supabaseUrl.startsWith('http')
  ) {
    try {
      supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      isSupabaseConfigured = true;
      return;
    } catch (err) {
      console.error('⚠️ Failed to initialize Supabase client:', err);
    }
  }
  supabase = null;
  isSupabaseConfigured = false;
}

initSupabaseFromEnv();

export function resetSchemaCaches() {
  cachedSchema = createDefaultSchemaState();
  tableMissingColumnsMap.clear();
  tableMissingColumnsMap.set('products', new Set<string>());
  tableMissingColumnsMap.set('orders', new Set<string>());
  inFlightTableFetches.clear();
}

/**
 * Test helper: inject a mock Supabase client (or null to simulate unconfigured)
 */
export function setSupabaseClientForTesting(client: any | null, configured?: boolean) {
  supabase = client;
  isSupabaseConfigured = configured !== undefined ? configured : Boolean(client);
  resetSchemaCaches();
}

export function requireSupabase(): SupabaseClient {
  if (!supabase || !isSupabaseConfigured) {
    throw new DatabaseError(
      'Supabase database is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      503,
      'SUPABASE_NOT_CONFIGURED'
    );
  }
  return supabase;
}

export function translateSupabaseError(error: any, tableName?: string): DatabaseError {
  if (isDatabaseError(error)) return error;
  const rawMessage = String(error?.message || error?.error_description || error || 'Unknown database error');
  const codeStr = String(error?.code || '');
  const lower = rawMessage.toLowerCase();

  if (codeStr === '23505' || lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return new DatabaseError(rawMessage, 409, 'CONSTRAINT_ERROR', tableName, rawMessage);
  }
  if (
    codeStr === '42P01' ||
    lower.includes('relation') && lower.includes('does not exist') ||
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('socket') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable')
  ) {
    return new DatabaseError(
      `Supabase database unavailable${tableName ? ` (${tableName})` : ''}: ${rawMessage}`,
      503,
      'SUPABASE_UNAVAILABLE',
      tableName,
      rawMessage
    );
  }
  return new DatabaseError(
    `Database error${tableName ? ` on '${tableName}'` : ''}: ${rawMessage}`,
    503,
    'SUPABASE_UNAVAILABLE',
    tableName,
    rawMessage
  );
}

/**
 * Inspect live Supabase PostgreSQL schema with zero-data limit(0) queries.
 */
export async function inspectSupabaseSchema(): Promise<SupabaseSchemaInspection> {
  if (!supabase || !isSupabaseConfigured) return cachedSchema;
  if (cachedSchema.inspected) return cachedSchema;

  try {
    const { error: basePriceErr } = await supabase.from('products').select('base_price_per_kg').limit(0);
    if (!basePriceErr) {
      cachedSchema.hasBasePricePerKg = true;
      cachedSchema.basePriceColName = 'base_price_per_kg';
      cachedSchema.productColumns.add('base_price_per_kg');
    } else {
      const { error: camelErr } = await supabase.from('products').select('basePricePerKg').limit(0);
      if (!camelErr) {
        cachedSchema.hasBasePricePerKg = true;
        cachedSchema.basePriceColName = 'basePricePerKg';
        cachedSchema.productColumns.add('basePricePerKg');
      } else {
        cachedSchema.hasBasePricePerKg = false;
        cachedSchema.basePriceColName = null;
      }
    }

    const { error: pricingModeErr } = await supabase.from('products').select('pricing_mode').limit(0);
    if (!pricingModeErr) {
      cachedSchema.hasPricingMode = true;
      cachedSchema.pricingModeColName = 'pricing_mode';
      cachedSchema.productColumns.add('pricing_mode');
    } else {
      const { error: camelPricingErr } = await supabase.from('products').select('pricingMode').limit(0);
      if (!camelPricingErr) {
        cachedSchema.hasPricingMode = true;
        cachedSchema.pricingModeColName = 'pricingMode';
        cachedSchema.productColumns.add('pricingMode');
      } else {
        cachedSchema.hasPricingMode = false;
        cachedSchema.pricingModeColName = null;
      }
    }

    const { error: slabsErr } = await supabase.from('products').select('weight_slabs').limit(0);
    if (!slabsErr) {
      cachedSchema.hasWeightSlabs = true;
      cachedSchema.weightSlabsColName = 'weight_slabs';
      cachedSchema.productColumns.add('weight_slabs');
    } else {
      const { error: camelSlabsErr } = await supabase.from('products').select('weightSlabs').limit(0);
      if (!camelSlabsErr) {
        cachedSchema.hasWeightSlabs = true;
        cachedSchema.weightSlabsColName = 'weightSlabs';
        cachedSchema.productColumns.add('weightSlabs');
      } else {
        cachedSchema.hasWeightSlabs = false;
        cachedSchema.weightSlabsColName = null;
      }
    }

    const { error: imagesErr } = await supabase.from('products').select('images').limit(0);
    cachedSchema.hasImages = !imagesErr;
    if (!imagesErr) cachedSchema.productColumns.add('images');

    const { error: imgErr } = await supabase.from('products').select('img').limit(0);
    cachedSchema.hasImg = !imgErr;
    if (!imgErr) cachedSchema.productColumns.add('img');

    const { error: imageErr } = await supabase.from('products').select('image').limit(0);
    cachedSchema.hasImage = !imageErr;
    if (!imageErr) cachedSchema.productColumns.add('image');

    const { error: imageUrlErr } = await supabase.from('products').select('image_url').limit(0);
    cachedSchema.hasImageUrl = !imageUrlErr;
    if (!imageUrlErr) cachedSchema.productColumns.add('image_url');

    const { error: reservedErr } = await supabase.from('products').select('reserved_qty').limit(0);
    cachedSchema.hasReservedQty = !reservedErr;
    if (!reservedErr) cachedSchema.productColumns.add('reserved_qty');

    const { error: soldErr } = await supabase.from('products').select('sold_qty').limit(0);
    cachedSchema.hasSoldQty = !soldErr;
    if (!soldErr) cachedSchema.productColumns.add('sold_qty');

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

    const { error: ptErr } = await supabase.from('payment_transactions').select('id').limit(0);
    cachedSchema.hasPaymentTransactionsTable = !ptErr;

    const { error: patErr } = await supabase.from('payment_audit_trail').select('id').limit(0);
    cachedSchema.hasPaymentAuditTrailTable = !patErr;

    cachedSchema.inspected = true;
  } catch (e) {
    console.warn('⚠️ Could not inspect Supabase schema:', e);
  }

  return cachedSchema;
}

/**
 * Startup & Health Verification for Supabase PostgreSQL
 */
export async function verifySupabaseConnection(): Promise<{
  isConfigured: boolean;
  hasUrl: boolean;
  hasServiceRoleKey: boolean;
  connected: boolean;
  message: string;
}> {
  const urlVal = (process.env.SUPABASE_URL || '').trim();
  const keyVal = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const hasUrl = Boolean(urlVal && urlVal.startsWith('http') && !urlVal.includes('YOUR_SUPABASE'));
  const hasServiceRoleKey = Boolean(keyVal && !keyVal.includes('YOUR_SUPABASE'));

  if ((!hasUrl || !hasServiceRoleKey) && !(isSupabaseConfigured && supabase)) {
    const errorMsg = `Supabase configuration missing: SUPABASE_URL=${hasUrl ? 'CONFIGURED' : 'MISSING'}, SUPABASE_SERVICE_ROLE_KEY=${hasServiceRoleKey ? 'CONFIGURED' : 'MISSING'}`;
    console.error(`❌ [Supabase Configuration Error] ${errorMsg}`);
    return {
      isConfigured: false,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: errorMsg
    };
  }

  if (!supabase || !isSupabaseConfigured) {
    return {
      isConfigured: false,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: 'Supabase client failed to initialize'
    };
  }

  try {
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      console.error(`❌ Supabase connection test failed: ${error.message}`);
      return {
        isConfigured: true,
        hasUrl,
        hasServiceRoleKey,
        connected: false,
        message: `Supabase query failed: ${error.message}`
      };
    }

    await inspectSupabaseSchema();

    return {
      isConfigured: true,
      hasUrl,
      hasServiceRoleKey,
      connected: true,
      message: 'Supabase PostgreSQL database connected successfully.'
    };
  } catch (err: any) {
    console.error('❌ Supabase connection exception:', err.message || err);
    return {
      isConfigured: true,
      hasUrl,
      hasServiceRoleKey,
      connected: false,
      message: err.message || 'Connection exception'
    };
  }
}

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

  let img = String(p.img || p.image || p.image_url || '').trim();
  if (!img && rawImages.length > 0) {
    const first = rawImages[0];
    img = String(typeof first === 'string' ? first : (first?.url || '')).trim();
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
    images: rawImages,
    emoji: p.emoji || '🥬',
    rating: Number(p.rating || 5.0),
    reviews: Number(p.reviews || 0),
    stockQty: Number(p.stock_qty !== undefined ? p.stock_qty : (p.stockQty !== undefined ? p.stockQty : 50)),
    reservedQty: Number(p.reserved_qty !== undefined ? p.reserved_qty : (p.reservedQty !== undefined ? p.reservedQty : 0)),
    soldQty: Number(p.sold_qty !== undefined ? p.sold_qty : (p.soldQty !== undefined ? p.soldQty : 0)),
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
  const client = requireSupabase();

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

  if (finalImages && finalImages.length > 0 && finalImg === undefined) {
    const first = finalImages[0];
    finalImg = typeof first === 'string' ? first.trim() : (first?.url || '').trim();
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
  if (updates.reservedQty !== undefined || updates.reserved_qty !== undefined) {
    row.reserved_qty = Number(updates.reservedQty !== undefined ? updates.reservedQty : updates.reserved_qty);
  }
  if (updates.soldQty !== undefined || updates.sold_qty !== undefined) {
    row.sold_qty = Number(updates.soldQty !== undefined ? updates.soldQty : updates.sold_qty);
  }
  if (updates.lowAt !== undefined || updates.low_at !== undefined) {
    row.low_at = Number(updates.lowAt !== undefined ? updates.lowAt : updates.low_at);
  }
  if (updates.description !== undefined) row.description = String(updates.description).trim();

  if (finalImg !== undefined) {
    if (cachedSchema.hasImg || !cachedSchema.inspected) {
      row.img = finalImg;
    } else if (cachedSchema.hasImageUrl) {
      row.image_url = finalImg;
    } else if (cachedSchema.hasImage) {
      row.image = finalImg;
    }
  }
  if (finalImages !== undefined && cachedSchema.hasImages) {
    row.images = finalImages;
  }
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

  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const knownMissing = tableMissingColumnsMap.get('products');
    if (knownMissing) {
      for (const col of knownMissing) delete row[col];
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
    if (!cachedSchema.hasSoldQty) delete row.sold_qty;
    if (!cachedSchema.hasReservedQty) delete row.reserved_qty;

    let { data, error } = await client
      .from('products')
      .update(row)
      .eq('id', id)
      .select(TABLE_SELECT_COLUMNS.products || '*');

    if (error && extractMissingColumn(error.message)) {
      const missingCol = extractMissingColumn(error.message)!;
      recordMissingProductColumn(missingCol);
      delete row[missingCol];
      continue;
    }

    if (error) {
      throw translateSupabaseError(error, 'products');
    }

    if (!data || data.length === 0) {
      const insertRow = { id, ...row };
      const { data: insertedData, error: insertError } = await client
        .from('products')
        .upsert(insertRow, { onConflict: 'id' })
        .select(TABLE_SELECT_COLUMNS.products || '*');
      if (insertError) {
        if (extractMissingColumn(insertError.message)) {
          const missingCol = extractMissingColumn(insertError.message)!;
          recordMissingProductColumn(missingCol);
          delete row[missingCol];
          continue;
        }
        throw translateSupabaseError(insertError, 'products');
      }
      data = insertedData || [];
    }

    const returnedRow = data[0];
    const normalized = normalizeProductFromDb(returnedRow);
    const mergedProduct = {
      ...normalized,
      img: finalImg !== undefined ? finalImg : normalized?.img,
      images: finalImages && finalImages.length > 0 ? finalImages : normalized?.images,
      basePricePerKg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized?.basePricePerKg,
      base_price_per_kg: resolvedBasePrice !== undefined ? resolvedBasePrice : normalized?.base_price_per_kg,
      weightSlabs: slabs !== undefined ? slabs : normalized?.weightSlabs,
      weight_slabs: slabs !== undefined ? slabs : normalized?.weight_slabs,
      pricingMode: updates.pricingMode || updates.pricing_mode || normalized?.pricingMode
    };
    return { success: true, product: mergedProduct };
  }

  throw new DatabaseError('Maximum schema adaptation retries exceeded updating product', 503, 'SUPABASE_UNAVAILABLE', 'products');
}

function recordMissingProductColumn(missingCol: string) {
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
  if (missingCol === 'sold_qty') cachedSchema.hasSoldQty = false;
  if (missingCol === 'reserved_qty') cachedSchema.hasReservedQty = false;
}

export async function syncProductToSupabase(product: any): Promise<boolean> {
  requireSupabase();

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
  const imagesArr = Array.isArray(product.images) && product.images.length > 0 ? product.images : undefined;

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
    emoji: product.emoji || '🥬',
    rating: Number(product.rating || 5.0),
    reviews: Number(product.reviews || 0),
    stock_qty: Number(product.stockQty !== undefined ? product.stockQty : (product.stock_qty !== undefined ? product.stock_qty : 50)),
    reserved_qty: Number(product.reservedQty !== undefined ? product.reservedQty : (product.reserved_qty !== undefined ? product.reserved_qty : 0)),
    sold_qty: Number(product.soldQty !== undefined ? product.soldQty : (product.sold_qty !== undefined ? product.sold_qty : 0)),
    low_at: Number(product.lowAt !== undefined ? product.lowAt : (product.low_at !== undefined ? product.low_at : 10)),
    description: product.description || ''
  };

  if (cachedSchema.hasImg || !cachedSchema.inspected) {
    row.img = imgUrl;
  } else if (cachedSchema.hasImageUrl) {
    row.image_url = imgUrl;
  } else if (cachedSchema.hasImage) {
    row.image = imgUrl;
  }
  if (imagesArr && cachedSchema.hasImages) row.images = imagesArr;
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
}

export async function syncOrderToSupabase(order: any): Promise<boolean> {
  requireSupabase();

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
    customer_id: String(order.customerId || order.userId || 'guest'),
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
    payment_discount_value: order.paymentDiscountValue !== undefined && order.paymentDiscountValue !== null ? Number(order.paymentDiscountValue) : null,
    payment_discount_amount: Number(order.paymentDiscountAmount || 0),
    payment_discount_label: order.paymentDiscountLabel || null,
    payment_discount_min_order: order.paymentDiscountMinOrder !== undefined && order.paymentDiscountMinOrder !== null ? Number(order.paymentDiscountMinOrder) : null,
    payment_discount_max_discount: order.paymentDiscountMaxDiscount !== undefined && order.paymentDiscountMaxDiscount !== null ? Number(order.paymentDiscountMaxDiscount) : null,
    total_discount: Number(order.totalDiscount || (order.discountApplied || 0) + (order.paymentDiscountAmount || 0)),
    status: order.status || 'New Orders',
    admin_remarks: order.adminRemarks || '',
    assigned_rider: order.assignedRider || '',
    delivery_instructions: order.deliveryInstructions || '',
    payment_gateway: order.paymentGateway || (order.razorpayPaymentId ? 'razorpay' : (order.upiIdUsed ? 'upi' : 'cod')),
    refund_amount: Number(order.refundAmount || 0),
    refund_history: order.refundHistory || [],
    refund_id: order.refundId || '',
    refund_status: order.refundStatus || '',
    refund_reason: order.refundReason || '',
    payment_audit_trail: order.paymentAuditTrail || [],
    stock_deducted: Boolean(order.stockDeducted === true),
    stock_reserved: Boolean(order.stockReserved === true),
    stock_released: Boolean(order.stockReleased === true),
    inventory_status: order.inventoryStatus || '',
    stock_released_at: order.stockReleasedAt || null,
    stock_release_reason: order.stockReleaseReason || '',
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

  return await upsertTable('orders', row, 'id');
}

export async function syncPaymentTransactionToSupabase(txn: any): Promise<boolean> {
  requireSupabase();
  if (cachedSchema.inspected && cachedSchema.hasPaymentTransactionsTable === false) {
    throw new DatabaseError('payment_transactions table is missing in Supabase schema', 503, 'SUPABASE_UNAVAILABLE', 'payment_transactions');
  }
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
}

export async function syncPaymentAuditToSupabase(audit: any): Promise<boolean> {
  requireSupabase();
  if (cachedSchema.inspected && cachedSchema.hasPaymentAuditTrailTable === false) {
    throw new DatabaseError('payment_audit_trail table is missing in Supabase schema', 503, 'SUPABASE_UNAVAILABLE', 'payment_audit_trail');
  }
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
}

export async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const client = requireSupabase();
  if (!client.storage || typeof client.storage.from !== 'function') {
    throw new DatabaseError('Supabase Storage client is unavailable.', 503, 'SUPABASE_UNAVAILABLE', `storage:${bucketName}`);
  }

  try {
    if (typeof client.storage.listBuckets === 'function') {
      try {
        const { data: buckets, error: listErr } = await client.storage.listBuckets();
        if (!listErr && Array.isArray(buckets) && !buckets.some((b: any) => b.name === bucketName)) {
          if (typeof client.storage.createBucket === 'function') {
            const { error: createErr } = await client.storage.createBucket(bucketName, { public: true });
            if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
              console.warn(`[Storage] Could not auto-create bucket "${bucketName}":`, createErr.message);
            }
          }
        }
      } catch (bucketErr: any) {
        console.warn(`[Storage] Bucket inspection warning for "${bucketName}":`, bucketErr?.message || bucketErr);
      }
    }

    const { error } = await client.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      throw translateSupabaseError(error, `storage:${bucketName}`);
    }

    const { data: publicUrlData } = client.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      throw new DatabaseError(`Failed to resolve public URL for ${bucketName}/${filePath}`, 503, 'SUPABASE_UNAVAILABLE', `storage:${bucketName}`);
    }

    return publicUrlData.publicUrl;
  } catch (err) {
    if (isDatabaseError(err)) throw err;
    throw translateSupabaseError(err, `storage:${bucketName}`);
  }
}

export async function deleteFromSupabaseStorage(bucketName: string, filePath: string): Promise<void> {
  const client = requireSupabase();
  if (!filePath) return;
  try {
    const { error } = await client.storage.from(bucketName).remove([filePath]);
    if (error) {
      console.warn(`⚠️ [Storage Delete Warning] ${bucketName}/${filePath}: ${error.message}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ [Storage Delete Exception] ${bucketName}/${filePath}: ${err.message || err}`);
  }
}

function extractMissingColumn(errorMsg?: string): string | null {
  if (!errorMsg) return null;
  const match =
    errorMsg.match(/Could not find the '([^']+)' column/i) ||
    errorMsg.match(/column "([^"]+)" of relation "[^"]+" does not exist/i) ||
    errorMsg.match(/column "([^"]+)" does not exist/i);
  return match && match[1] ? match[1] : null;
}

export interface FetchTableOptions<T = any> {
  columns?: string;
  filter?: (query: any) => any;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  transformRow?: (row: any) => T;
}

export interface PaginatedResult<T = any> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

function resolveTableName(tableName: string): string {
  if (tableName === 'payment_method_discounts' && cachedSchema.paymentMethodDiscountsTableName) {
    return cachedSchema.paymentMethodDiscountsTableName;
  }
  return tableName;
}

/**
 * Fetch rows from Supabase PostgreSQL. Throws DatabaseError if unconfigured or query fails.
 */
export async function fetchTable<T = any>(
  tableName: string,
  options?: FetchTableOptions<T>
): Promise<T[]> {
  const client = requireSupabase();
  const resolvedTable = resolveTableName(tableName);
  const selectCols = options?.columns || TABLE_SELECT_COLUMNS[tableName] || TABLE_SELECT_COLUMNS[resolvedTable] || '*';

  const canCoalesce = !options?.filter && !options?.limit && !options?.offset && !options?.orderBy;
  const fetchKey = `${resolvedTable}:${selectCols}`;
  if (canCoalesce && inFlightTableFetches.has(fetchKey)) {
    const existingData = await inFlightTableFetches.get(fetchKey)!;
    return options?.transformRow ? existingData.map(options.transformRow) : (existingData as T[]);
  }

  const execute = async (): Promise<any[]> => {
    let query = client.from(resolvedTable).select(selectCols);
    if (options?.filter) {
      query = options.filter(query);
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
    }
    if (options?.limit !== undefined) {
      const start = Math.max(0, options.offset || 0);
      const end = start + Math.max(1, options.limit) - 1;
      query = query.range(start, end);
    }

    let { data, error } = await query;
    if (error && selectCols !== '*' && extractMissingColumn(error.message)) {
      let fallbackQuery = client.from(resolvedTable).select('*');
      if (options?.filter) fallbackQuery = options.filter(fallbackQuery);
      if (options?.orderBy) fallbackQuery = fallbackQuery.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
      if (options?.limit !== undefined) {
        const start = Math.max(0, options.offset || 0);
        const end = start + Math.max(1, options.limit) - 1;
        fallbackQuery = fallbackQuery.range(start, end);
      }
      const fallbackRes = await fallbackQuery;
      data = fallbackRes.data;
      error = fallbackRes.error;
    }

    if (error) {
      if (tableName === 'payment_method_discounts' && resolvedTable === 'payment_method_discounts') {
        const { data: camelData, error: camelErr } = await client.from('paymentMethodDiscounts').select('*');
        if (!camelErr && Array.isArray(camelData)) {
          cachedSchema.hasPaymentMethodDiscountsTable = true;
          cachedSchema.paymentMethodDiscountsTableName = 'paymentMethodDiscounts';
          return camelData;
        }
      }
      throw translateSupabaseError(error, resolvedTable);
    }

    return Array.isArray(data) ? data : [];
  };

  if (canCoalesce) {
    const promise = execute();
    inFlightTableFetches.set(fetchKey, promise);
    try {
      const rows = await promise;
      return options?.transformRow ? rows.map(options.transformRow) : (rows as T[]);
    } finally {
      inFlightTableFetches.delete(fetchKey);
    }
  }

  const rows = await execute();
  return options?.transformRow ? rows.map(options.transformRow) : (rows as T[]);
}

/**
 * Fetch ALL rows from a table across pages of 1000 rows so no records are silently truncated.
 */
export async function fetchAllRows<T = any>(
  tableName: string,
  options?: Omit<FetchTableOptions<T>, 'limit' | 'offset'>
): Promise<T[]> {
  const client = requireSupabase();
  const resolvedTable = resolveTableName(tableName);
  const selectCols = options?.columns || TABLE_SELECT_COLUMNS[tableName] || TABLE_SELECT_COLUMNS[resolvedTable] || '*';
  const pageSize = 1000;
  const allRows: any[] = [];
  let offset = 0;
  let activeCols = selectCols;

  while (true) {
    let query = client.from(resolvedTable).select(activeCols);
    if (options?.filter) {
      query = options.filter(query);
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
    }
    query = query.range(offset, offset + pageSize - 1);

    let { data, error } = await query;
    if (error && activeCols !== '*' && extractMissingColumn(error.message)) {
      activeCols = '*';
      let retryQuery = client.from(resolvedTable).select('*');
      if (options?.filter) retryQuery = options.filter(retryQuery);
      if (options?.orderBy) retryQuery = retryQuery.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
      retryQuery = retryQuery.range(offset, offset + pageSize - 1);
      const retryRes = await retryQuery;
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      throw translateSupabaseError(error, resolvedTable);
    }

    const batch = Array.isArray(data) ? data : [];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return options?.transformRow ? allRows.map(options.transformRow) : (allRows as T[]);
}

/**
 * Fetch paginated rows with exact total count.
 */
export async function fetchTablePaginated<T = any>(
  tableName: string,
  options?: FetchTableOptions<T> & { limit?: number; offset?: number }
): Promise<PaginatedResult<T>> {
  const client = requireSupabase();
  const resolvedTable = resolveTableName(tableName);
  const selectCols = options?.columns || TABLE_SELECT_COLUMNS[tableName] || TABLE_SELECT_COLUMNS[resolvedTable] || '*';
  const limit = Math.max(1, Math.min(Number(options?.limit || 50), 500));
  const offset = Math.max(0, Number(options?.offset || 0));

  let activeCols = selectCols;
  for (let attempt = 0; attempt < 2; attempt++) {
    let query = client.from(resolvedTable).select(activeCols, { count: 'exact' });
    if (options?.filter) {
      query = options.filter(query);
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
    }
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      if (activeCols !== '*' && extractMissingColumn(error.message)) {
        activeCols = '*';
        continue;
      }
      throw translateSupabaseError(error, resolvedTable);
    }

    const rawRows = Array.isArray(data) ? data : [];
    const total = typeof count === 'number' ? count : offset + rawRows.length;
    const rows = options?.transformRow ? rawRows.map(options.transformRow) : (rawRows as T[]);
    return {
      rows,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total
    };
  }

  return { rows: [], total: 0, limit, offset, hasMore: false };
}

export async function fetchOneRow<T = any>(
  tableName: string,
  filter: (query: any) => any,
  columns?: string
): Promise<T | null> {
  const rows = await fetchTable<T>(tableName, { columns, filter, limit: 1 });
  return rows.length > 0 ? rows[0] : null;
}

export async function countTableRows(
  tableName: string,
  filter?: (query: any) => any
): Promise<number> {
  const client = requireSupabase();
  const resolvedTable = resolveTableName(tableName);
  let query = client.from(resolvedTable).select('*', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) {
    throw translateSupabaseError(error, resolvedTable);
  }
  return count || 0;
}

/**
 * Insert or upsert records in batches with schema-column adaptation.
 * Throws DatabaseError when Supabase is unconfigured or the write fails.
 */
export async function upsertTable(
  tableName: string,
  records: any | any[],
  onConflictColumn?: string,
  options?: { ignoreDuplicates?: boolean }
): Promise<boolean> {
  const client = requireSupabase();
  let payload = Array.isArray(records) ? records : [records];
  if (payload.length === 0) return true;

  let targetTable = resolveTableName(tableName);
  const chunkSize = 200;

  for (let start = 0; start < payload.length; start += chunkSize) {
    let chunk = payload.slice(start, start + chunkSize);

    const maxRetries = 15;
    let succeeded = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const allowedCols = tableColumnsMap.get(targetTable) || tableColumnsMap.get(tableName);
      const knownMissing = tableMissingColumnsMap.get(targetTable) || tableMissingColumnsMap.get(tableName);

      let cleanPayload = chunk.map(row => {
        const cleanRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (allowedCols && allowedCols.size > 0) {
            if (allowedCols.has(key) || key === onConflictColumn) {
              cleanRow[key] = value;
            }
          } else if (!knownMissing || !knownMissing.has(key)) {
            cleanRow[key] = value;
          }
        }
        return cleanRow;
      });

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
          if (!cachedSchema.hasSoldQty) delete r.sold_qty;
          if (!cachedSchema.hasReservedQty) delete r.reserved_qty;
          return r;
        });
      }

      const upsertOpts: any = {};
      if (onConflictColumn) upsertOpts.onConflict = onConflictColumn;
      if (options?.ignoreDuplicates) upsertOpts.ignoreDuplicates = true;

      const { error } = await client
        .from(targetTable)
        .upsert(cleanPayload, Object.keys(upsertOpts).length > 0 ? upsertOpts : undefined);

      if (!error) {
        succeeded = true;
        break;
      }

      const missingCol = extractMissingColumn(error.message);
      if (missingCol) {
        if (!tableMissingColumnsMap.has(tableName)) {
          tableMissingColumnsMap.set(tableName, new Set());
        }
        tableMissingColumnsMap.get(tableName)!.add(missingCol);
        if (tableColumnsMap.has(tableName)) {
          tableColumnsMap.get(tableName)!.delete(missingCol);
        }
        if (tableName === 'products') {
          recordMissingProductColumn(missingCol);
        }
        chunk = chunk.map(row => {
          const c = { ...row };
          delete c[missingCol];
          return c;
        });
        continue;
      }

      const errorMsg = error.message || '';
      if (errorMsg.includes('foreign key constraint') || errorMsg.includes('violates foreign key')) {
        let hasUserId = false;
        chunk = chunk.map(row => {
          if (row.user_id) {
            hasUserId = true;
            return { ...row, user_id: null };
          }
          return row;
        });
        if (hasUserId) continue;
      }

      throw translateSupabaseError(error, targetTable);
    }

    if (!succeeded) {
      throw new DatabaseError(`Exceeded retry limit upserting into '${targetTable}'`, 503, 'SUPABASE_UNAVAILABLE', targetTable);
    }
  }

  return true;
}

/**
 * Update rows matching a filter and return updated records
 */
export async function updateRows<T = any>(
  tableName: string,
  updates: Record<string, any>,
  filter: (query: any) => any,
  columns?: string
): Promise<T[]> {
  const client = requireSupabase();
  const targetTable = resolveTableName(tableName);
  const selectCols = columns || TABLE_SELECT_COLUMNS[tableName] || TABLE_SELECT_COLUMNS[targetTable] || '*';

  let payload: Record<string, any> = { ...updates };
  const knownMissing = tableMissingColumnsMap.get(targetTable) || tableMissingColumnsMap.get(tableName);
  if (knownMissing) {
    for (const col of knownMissing) delete payload[col];
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    let query = client.from(targetTable).update(payload);
    query = filter(query);
    const { data, error } = await query.select(selectCols);

    if (!error) {
      return Array.isArray(data) ? (data as T[]) : [];
    }

    const missingCol = extractMissingColumn(error.message);
    if (missingCol) {
      if (!tableMissingColumnsMap.has(tableName)) {
        tableMissingColumnsMap.set(tableName, new Set());
      }
      tableMissingColumnsMap.get(tableName)!.add(missingCol);
      delete payload[missingCol];
      if (Object.keys(payload).length === 0) return [];
      continue;
    }

    throw translateSupabaseError(error, targetTable);
  }

  throw new DatabaseError(`Exceeded retry limit updating '${targetTable}'`, 503, 'SUPABASE_UNAVAILABLE', targetTable);
}

/**
 * Delete a single matching subset from Supabase PostgreSQL table
 */
export async function deleteFromTable(
  tableName: string,
  matchColumn: string,
  matchValue: any
): Promise<{ success: boolean; error?: string }> {
  const client = requireSupabase();
  const targetTable = resolveTableName(tableName);

  const { error } = await client.from(targetTable).delete().eq(matchColumn, matchValue);
  if (error) {
    throw translateSupabaseError(error, targetTable);
  }
  return { success: true };
}

/**
 * Delete rows matching custom filter from Supabase PostgreSQL table
 */
export async function deleteWhere(
  tableName: string,
  filter: (query: any) => any
): Promise<void> {
  const client = requireSupabase();
  const targetTable = resolveTableName(tableName);
  const query = filter(client.from(targetTable).delete());
  const { error } = await query;
  if (error) {
    throw translateSupabaseError(error, targetTable);
  }
}

/**
 * Delete multiple records from Supabase PostgreSQL table
 */
export async function deleteManyFromTable(
  tableName: string,
  matchColumn: string,
  matchValues: any[]
): Promise<{ success: boolean; count: number; error?: string }> {
  const client = requireSupabase();
  const targetTable = resolveTableName(tableName);

  if (!Array.isArray(matchValues) || matchValues.length === 0) {
    return { success: true, count: 0 };
  }

  const chunkSize = 200;
  for (let i = 0; i < matchValues.length; i += chunkSize) {
    const slice = matchValues.slice(i, i + chunkSize);
    const { error } = await client.from(targetTable).delete().in(matchColumn, slice);
    if (error) {
      throw translateSupabaseError(error, targetTable);
    }
  }
  return { success: true, count: matchValues.length };
}

/**
 * Execute a PostgreSQL stored procedure / RPC function via Supabase.
 * Distinguishes missing RPC function (allows caller to use CAS fallback) from real DB errors.
 */
export async function callRpc<T = any>(
  fnName: string,
  params: Record<string, any>
): Promise<{ data: T | null; missingFunction: boolean }> {
  const client = requireSupabase();
  if (typeof (client as any).rpc !== 'function') {
    return { data: null, missingFunction: true };
  }

  const { data, error } = await client.rpc(fnName, params);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    const code = String(error.code || '');
    if (
      code === '42883' ||
      code === 'PGRST202' ||
      msg.includes('could not find the function') ||
      (msg.includes('function') && msg.includes('does not exist'))
    ) {
      return { data: null, missingFunction: true };
    }
    throw translateSupabaseError(error, `rpc:${fnName}`);
  }

  return { data: data as T, missingFunction: false };
}
