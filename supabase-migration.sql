-- ==============================================================================
-- SABJIES SUPABASE PRODUCTION PERSISTENCE MIGRATION
-- Run this in Supabase Dashboard -> SQL Editor
-- This migration is completely non-destructive and idempotent (safe to run repeatedly).
-- ==============================================================================

-- 1. Ensure Products Table has Weight Slabs, Pricing Mode, and Harmonized Image columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_price_per_kg NUMERIC(10, 2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'auto';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_slabs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS img TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';

-- Populate base_price_per_kg from sp where empty
UPDATE public.products SET base_price_per_kg = sp WHERE base_price_per_kg IS NULL;

-- Harmonize image columns across img, image, and image_url
UPDATE public.products 
SET img = COALESCE(NULLIF(img, ''), NULLIF(image, ''), NULLIF(image_url, ''), '')
WHERE img IS NULL OR img = '';

UPDATE public.products 
SET image = img 
WHERE (image IS NULL OR image = '') AND img IS NOT NULL AND img != '';

UPDATE public.products 
SET image_url = img 
WHERE (image_url IS NULL OR image_url = '') AND img IS NOT NULL AND img != '';

-- Populate images JSONB array from img if images is empty or '[]'
UPDATE public.products
SET images = jsonb_build_array(jsonb_build_object('id', 'img_' || id::text || '_0', 'url', img, 'tag', 'Cover', 'isConfirmed', true, 'isMatch', true))
WHERE (images IS NULL OR images = '[]'::jsonb) AND img IS NOT NULL AND img != '';

-- 2. Ensure Orders Table has Customer ID, remarks, and update tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_remarks TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_rider TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utr TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS upi_id_used TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Populate customer_id from user_id where empty
UPDATE public.orders SET customer_id = user_id WHERE customer_id IS NULL AND user_id IS NOT NULL;

-- 3. Ensure high-performance indexes for order sorting and customer queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON public.orders(user_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_products_cat ON public.products(cat);

-- 4. Disable Row Level Security on operational tables to allow Service Role backend access
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;

-- 5. Payment Method Discounts Table
CREATE TABLE IF NOT EXISTS public.payment_method_discounts (
  id TEXT PRIMARY KEY,
  payment_method TEXT NOT NULL,
  payment_method_name TEXT NOT NULL,
  discount_type TEXT NOT NULL, -- 'percent' or 'fixed'
  discount_value NUMERIC(10, 2) NOT NULL,
  min_order NUMERIC(10, 2), -- NULL means no minimum order limit
  max_discount NUMERIC(10, 2), -- NULL means no maximum discount limit
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- 'active' or 'inactive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payment_method_discounts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pmd_payment_method ON public.payment_method_discounts(payment_method);
CREATE INDEX IF NOT EXISTS idx_pmd_status ON public.payment_method_discounts(status);

-- 6. Add payment discount and payment audit tracking columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_value NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_label TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT TRUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_released BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

-- 7. Payment Transactions Ledger Table
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
ALTER TABLE public.payment_transactions DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pt_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_pt_status ON public.payment_transactions(status);

-- 8. Payment Audit Trail Table
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
ALTER TABLE public.payment_audit_trail DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pat_order_id ON public.payment_audit_trail(order_id);

-- 9. Prevent duplicate UTR reuse across orders with partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_utr_unique 
  ON public.orders(utr) 
  WHERE utr IS NOT NULL AND utr != '' AND payment_status NOT IN ('Failed', 'Rejected', 'Cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key_unique 
  ON public.orders(idempotency_key) 
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id_unique 
  ON public.orders(razorpay_payment_id) 
  WHERE razorpay_payment_id IS NOT NULL AND razorpay_payment_id != '';

-- Prevent negative stock during simultaneous orders
DO $ 
BEGIN 
  ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_qty_non_negative CHECK (stock_qty >= 0); 
EXCEPTION 
  WHEN duplicate_object THEN NULL; 
END $;

-- 10. RELOAD SUPABASE POSTGREST SCHEMA CACHE
-- This instantly fixes the "Could not find column/table in schema cache" error in Supabase
NOTIFY pgrst, 'reload schema';

