import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

export interface MigrationResult {
  attempted: boolean;
  success: boolean;
  method: 'direct_postgres' | 'none';
  message: string;
  appliedColumns?: string[];
  appliedTables?: string[];
  error?: string;
}

/**
 * Returns available PostgreSQL connection string if configured
 */
export function getPostgresConnectionString(): string | null {
  const possibleKeys = [
    'DATABASE_URL',
    'SUPABASE_DB_URL',
    'POSTGRES_URL',
    'SUPABASE_DIRECT_URL',
    'PGURI',
    'POSTGRESQL_URL'
  ];

  for (const key of possibleKeys) {
    const val = process.env[key];
    if (val && !val.includes('YOUR_') && (val.startsWith('postgres://') || val.startsWith('postgresql://'))) {
      return val;
    }
  }

  return null;
}

/**
 * Safely execute idempotent schema migrations directly on PostgreSQL
 */
export async function runDirectPostgresMigration(): Promise<MigrationResult> {
  const connString = getPostgresConnectionString();

  if (!connString) {
    return {
      attempted: false,
      success: false,
      method: 'none',
      message: 'No direct PostgreSQL connection string (DATABASE_URL / SUPABASE_DB_URL) found in environment.'
    };
  }

  console.log('🔄 [PostgreSQL Migration Runner] Direct PostgreSQL connection string found. Executing schema synchronization...');

  const pool = new Pool({
    connectionString: connString,
    ssl: {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();

  try {
    const appliedColumns: string[] = [];
    const appliedTables: string[] = [];

    // 1. Ensure products table columns exist idempotently
    const productColumnsSql = [
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_price_per_kg NUMERIC(10, 2);`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg';`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'auto';`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_slabs JSONB DEFAULT '[]'::jsonb;`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS img TEXT DEFAULT '';`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';`,
      `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';`,
      `UPDATE public.products SET base_price_per_kg = sp WHERE base_price_per_kg IS NULL;`,
      `UPDATE public.products SET img = COALESCE(NULLIF(img, ''), NULLIF(image, ''), NULLIF(image_url, ''), '') WHERE img IS NULL OR img = '';`,
      `UPDATE public.products SET image = img WHERE (image IS NULL OR image = '') AND img IS NOT NULL AND img != '';`,
      `UPDATE public.products SET image_url = img WHERE (image_url IS NULL OR image_url = '') AND img IS NOT NULL AND img != '';`
    ];

    for (const sql of productColumnsSql) {
      await client.query(sql);
    }
    appliedColumns.push('base_price_per_kg', 'unit', 'pricing_mode', 'weight_slabs', 'images', 'description', 'img', 'image', 'image_url');

    // 2. Ensure payment_method_discounts table exists idempotently
    const paymentDiscountsTableSql = `
      CREATE TABLE IF NOT EXISTS public.payment_method_discounts (
        id TEXT PRIMARY KEY,
        payment_method TEXT NOT NULL,
        payment_method_name TEXT NOT NULL,
        discount_type TEXT NOT NULL DEFAULT 'fixed',
        discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        min_order NUMERIC(10, 2) DEFAULT NULL,
        max_discount NUMERIC(10, 2) DEFAULT NULL,
        start_date TEXT DEFAULT NULL,
        end_date TEXT DEFAULT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.payment_method_discounts ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "payment_method_discounts_select" ON public.payment_method_discounts;
      CREATE POLICY "payment_method_discounts_select" ON public.payment_method_discounts FOR SELECT USING (true);
      DROP POLICY IF EXISTS "payment_method_discounts_all" ON public.payment_method_discounts;
      CREATE POLICY "payment_method_discounts_all" ON public.payment_method_discounts FOR ALL USING (true) WITH CHECK (true);
    `;

    await client.query(paymentDiscountsTableSql);
    appliedTables.push('payment_method_discounts');

    // 3. Seed default discounts if table is empty
    const checkDiscounts = await client.query(`SELECT COUNT(*) FROM public.payment_method_discounts;`);
    const count = parseInt(checkDiscounts.rows[0].count, 10);
    if (count === 0) {
      await client.query(`
        INSERT INTO public.payment_method_discounts (id, payment_method, payment_method_name, discount_type, discount_value, min_order, max_discount, status)
        VALUES 
          ('pm_disc_upi', 'UPI', 'UPI / QR Code Instant Payment', 'percent', 5.00, 199.00, 50.00, 'active'),
          ('pm_disc_cod', 'COD', 'Cash on Delivery', 'fixed', 0.00, NULL, NULL, 'active')
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    // 4. Ensure Orders table payment and refund columns exist
    const orderPaymentColumnsSql = [
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT '';`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT 0;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_history JSONB DEFAULT '[]'::jsonb;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_released BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;`,
      `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;`
    ];
    for (const sql of orderPaymentColumnsSql) {
      await client.query(sql);
    }
    appliedColumns.push('payment_status', 'payment_gateway', 'refund_amount', 'refund_history', 'stock_deducted', 'stock_released', 'idempotency_key');

    // 5. Payment transactions and audit trail tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        user_id TEXT,
        user_email TEXT,
        amount NUMERIC(10, 2) NOT NULL,
        currency TEXT DEFAULT 'INR',
        gateway TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        transaction_id TEXT,
        utr TEXT,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        admin_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pt_order_id ON public.payment_transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_pt_status ON public.payment_transactions(status);

      CREATE TABLE IF NOT EXISTS public.payment_audit_trail (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        performed_by TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT NOT NULL,
        amount NUMERIC(10, 2),
        reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pat_order_id ON public.payment_audit_trail(order_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_utr_unique 
        ON public.orders(utr) 
        WHERE utr IS NOT NULL AND utr != '' AND payment_status NOT IN ('Failed', 'Rejected', 'Cancelled');

      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key_unique 
        ON public.orders(idempotency_key) 
        WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id_unique 
        ON public.orders(razorpay_payment_id) 
        WHERE razorpay_payment_id IS NOT NULL AND razorpay_payment_id != '';

      DO $ 
      BEGIN 
        ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_qty_non_negative CHECK (stock_qty >= 0); 
      EXCEPTION 
        WHEN duplicate_object THEN NULL; 
      END $;
    `);
    appliedTables.push('payment_transactions', 'payment_audit_trail');

    console.log('✅ [PostgreSQL Migration Runner] Direct database migration succeeded! All columns and tables are now in sync.');

    return {
      attempted: true,
      success: true,
      method: 'direct_postgres',
      message: 'PostgreSQL schema migration completed successfully via direct database connection.',
      appliedColumns,
      appliedTables
    };
  } catch (err: any) {
    console.error('❌ [PostgreSQL Migration Runner] Failed executing direct migration:', err);
    return {
      attempted: true,
      success: false,
      method: 'direct_postgres',
      message: err.message || 'Direct migration failed',
      error: err.message
    };
  } finally {
    client.release();
    await pool.end();
  }
}
