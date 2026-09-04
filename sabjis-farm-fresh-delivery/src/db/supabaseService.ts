import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
    console.log('✅ Supabase PostgreSQL Client successfully connected to:', supabaseUrl);
  } catch (err) {
    console.error('⚠️ Failed to initialize Supabase client:', err);
  }
} else {
  console.log('ℹ️ Supabase environment variables not configured. Application running in resilient hybrid memory mode.');
}

/**
 * Directly sync a single order to Supabase PostgreSQL for instant Realtime broadcast
 */
export async function syncOrderToSupabase(order: any): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const uId = (order.userId && order.userId !== 'guest') ? String(order.userId) : null;
    const row = {
      id: String(order.id),
      user_id: uId,
      user_email: order.userEmail || '',
      user_name: order.userName || order.customerName || 'Customer',
      items: order.items || [],
      subtotal: Number(order.subtotal || 0),
      delivery: Number(order.delivery || 0),
      discount_applied: Number(order.discountApplied || 0),
      coupon_applied: order.couponApplied || '',
      total: Number(order.total || 0),
      payment: order.payment || 'COD',
      payment_status: order.paymentStatus || 'Pending',
      utr_number: order.razorpayPaymentId || order.utrNumber || order.utr || order.transactionId || '',
      payment_screenshot: order.paymentScreenshot || order.screenshotUrl || '',
      status: order.status || 'Processing',

      address: order.address || '',
      phone: order.phone || '',
      created_at: order.createdAt || new Date().toISOString(),
      cancellation_reason: order.cancellationReason || '',
      cancelled_at: order.cancelledAt || null,
      refunded_at: order.refundedAt || null,
      refund_note: order.refundNote || '',
      cashier: order.cashier || 'Online Order'
    };

    return await upsertTable('orders', row, 'id');
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
