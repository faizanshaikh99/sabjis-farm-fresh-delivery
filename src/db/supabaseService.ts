import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isKgProduct } from '../utils/weightParser';

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
 * Startup Verification for Supabase Production Persistence
 * Verifies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY exist, tests connectivity,
 * and logs a clean status without exposing any secrets.
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
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      const errText = error.message;
      if (errText.includes('relation') || errText.includes('does not exist')) {
        console.log('✅ Supabase production database connected successfully (tables ready for initialization).');
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
export async function syncProductToSupabase(product: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const isKg = isKgProduct(product);
    const rawSlabs = Array.isArray(product.weightSlabs)
      ? product.weightSlabs
      : (Array.isArray(product.weight_slabs) ? product.weight_slabs : []);
    // Non-kg products must NEVER have weight slabs in the database
    const slabs = isKg ? rawSlabs : [];

    const resolvedBasePrice = Number(
      product.basePricePerKg !== undefined
        ? product.basePricePerKg
        : (product.base_price_per_kg !== undefined ? product.base_price_per_kg : product.sp)
    );

    const row = {
      id: Number(product.id),
      name: product.name,
      cat: product.cat,
      type: product.type || 'organic',
      cp: Number(product.cp || 0),
      sp: Number(product.sp || resolvedBasePrice),
      base_price_per_kg: resolvedBasePrice,
      weight: product.weight || (isKg ? 'per kg' : 'per piece'),
      discount: product.discount || '',
      img: product.img || '',
      images: Array.isArray(product.images) ? product.images : [],
      emoji: product.emoji || '🥬',
      rating: Number(product.rating || 5.0),
      reviews: Number(product.reviews || 0),
      stock_qty: Number(product.stockQty !== undefined ? product.stockQty : (product.stock_qty !== undefined ? product.stock_qty : 50)),
      low_at: Number(product.lowAt !== undefined ? product.lowAt : (product.low_at !== undefined ? product.low_at : 10)),
      weight_slabs: slabs,
      pricing_mode: isKg ? (product.pricingMode || product.pricing_mode || (slabs.length > 0 ? 'slabs' : 'auto')) : 'auto'
    };

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
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) {
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
 * Upsert records into Supabase PostgreSQL table
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

    const options = onConflictColumn ? { onConflict: onConflictColumn } : undefined;
    
    // Attempt up to 5 times stripping missing columns iteratively
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from(tableName).upsert(payload, options);
      if (!error) return true;

      const match = error.message ? error.message.match(/Could not find the '([^']+)' column/i) : null;
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[Supabase Schema Adaptive Fix] Stripping missing column '${missingCol}' from '${tableName}' and retrying...`);
        payload = payload.map(rec => {
          const clone = { ...rec };
          delete clone[missingCol];
          return clone;
        });
      } else {
        console.error(`[Supabase Upsert Error] Table '${tableName}':`, error.message);
        return false;
      }
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
