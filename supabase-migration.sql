-- ==============================================================================
-- SABJIES SUPABASE PRODUCTION PERSISTENCE MIGRATION (ADDITIVE & IDEMPOTENT)
-- Run this in Supabase Dashboard -> SQL Editor
-- This migration is completely non-destructive and safe to run repeatedly.
-- ==============================================================================

-- 1. Users & Sessions & Password Resets & Addresses
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS device TEXT DEFAULT '';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ip TEXT DEFAULT '';

ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';

ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
ALTER TABLE public.password_resets ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email';

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'system';

-- 2. Products Table: Weight Slabs, Pricing Mode, Stock Tracking, and Harmonized Image columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_price_per_kg NUMERIC(10, 2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'kg';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'auto';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_slabs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS img TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reserved_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sold_qty INTEGER NOT NULL DEFAULT 0;

UPDATE public.products SET base_price_per_kg = sp WHERE base_price_per_kg IS NULL;

UPDATE public.products
SET img = COALESCE(NULLIF(img, ''), NULLIF(image, ''), NULLIF(image_url, ''), '')
WHERE img IS NULL OR img = '';

UPDATE public.products
SET image = img
WHERE (image IS NULL OR image = '') AND img IS NOT NULL AND img != '';

UPDATE public.products
SET image_url = img
WHERE (image_url IS NULL OR image_url = '') AND img IS NOT NULL AND img != '';

UPDATE public.products
SET images = jsonb_build_array(jsonb_build_object('id', 'img_' || id::text || '_0', 'url', img, 'tag', 'Cover', 'isConfirmed', true, 'isMatch', true))
WHERE (images IS NULL OR images = '[]'::jsonb) AND img IS NOT NULL AND img != '';

-- 3. Orders Table: Complete Order, Delivery, Inventory & Payment Columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_remarks TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_rider TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_instructions TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utr TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS upi_id_used TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_value NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_label TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_min_order NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_max_discount NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_id TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reason TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_audit_trail JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_released BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_status TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_release_reason TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

UPDATE public.orders SET customer_id = user_id WHERE customer_id IS NULL AND user_id IS NOT NULL;

-- 4. Coupons, Redemption Logs, and Payment Settings
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10, 2);
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_per_customer TEXT DEFAULT '1';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_redemptions INTEGER;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'Regular Promo Code';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS campaign_name TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS ig_post_url TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS ig_reel_url TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS ig_story_link TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS campaign_notes TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS internal_description TEXT DEFAULT '';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS created_date TEXT DEFAULT '';

ALTER TABLE public.redemption_logs ADD COLUMN IF NOT EXISTS user_email TEXT DEFAULT '';
ALTER TABLE public.redemption_logs ADD COLUMN IF NOT EXISTS code TEXT DEFAULT '';

ALTER TABLE public.payment_settings ADD COLUMN IF NOT EXISTS qr_code_data_url TEXT DEFAULT '';
ALTER TABLE public.payment_settings ADD COLUMN IF NOT EXISTS qr_code_uploaded_at TIMESTAMPTZ;
ALTER TABLE public.payment_settings ADD COLUMN IF NOT EXISTS enable_razorpay BOOLEAN DEFAULT TRUE;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON public.orders(user_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_utr ON public.orders(utr);
CREATE INDEX IF NOT EXISTS idx_products_cat ON public.products(cat);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_logs_coupon_code ON public.redemption_logs(coupon_code);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON public.password_resets(email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_timestamp ON public.login_history(timestamp DESC);

-- 6. Disable Row Level Security for backend Service Role access
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

-- 7. Payment Method Discounts Table
CREATE TABLE IF NOT EXISTS public.payment_method_discounts (
  id TEXT PRIMARY KEY,
  payment_method TEXT NOT NULL,
  payment_method_name TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(10, 2) NOT NULL,
  min_order NUMERIC(10, 2),
  max_discount NUMERIC(10, 2),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payment_method_discounts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pmd_payment_method ON public.payment_method_discounts(payment_method);
CREATE INDEX IF NOT EXISTS idx_pmd_status ON public.payment_method_discounts(status);

-- 8. Payment Transactions Ledger Table
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

-- 9. Payment Audit Trail Table
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

-- 10. Prevent duplicate UTR, idempotency_key, and Razorpay payment reuse
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_utr_unique
  ON public.orders(utr)
  WHERE utr IS NOT NULL AND utr != '' AND payment_status NOT IN ('Failed', 'Rejected', 'Cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key_unique
  ON public.orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id_unique
  ON public.orders(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL AND razorpay_payment_id != '';

-- Prevent negative stock during simultaneous orders (fixed DO $$ block)
DO $$
BEGIN
  ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_qty_non_negative CHECK (stock_qty >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 11. Atomic Inventory & Coupon Stored Procedures (RPCs)
CREATE OR REPLACE FUNCTION public.reserve_product_stock_atomic(p_product_id BIGINT, p_qty INTEGER)
RETURNS TABLE(id BIGINT, stock_qty INTEGER, reserved_qty INTEGER, sold_qty INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.products
  SET
    stock_qty = products.stock_qty - p_qty,
    reserved_qty = COALESCE(products.reserved_qty, 0) + p_qty,
    updated_at = NOW()
  WHERE products.id = p_product_id
    AND p_qty > 0
    AND products.stock_qty >= p_qty
  RETURNING products.id, products.stock_qty, products.reserved_qty, products.sold_qty;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_product_stock_atomic(p_product_id BIGINT, p_qty INTEGER, p_was_reserved BOOLEAN DEFAULT FALSE)
RETURNS TABLE(id BIGINT, stock_qty INTEGER, reserved_qty INTEGER, sold_qty INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_was_reserved THEN
    RETURN QUERY
    UPDATE public.products
    SET
      stock_qty = CASE
        WHEN COALESCE(products.reserved_qty, 0) >= p_qty THEN products.stock_qty
        ELSE products.stock_qty - (p_qty - COALESCE(products.reserved_qty, 0))
      END,
      reserved_qty = GREATEST(0, COALESCE(products.reserved_qty, 0) - p_qty),
      sold_qty = COALESCE(products.sold_qty, 0) + p_qty,
      updated_at = NOW()
    WHERE products.id = p_product_id
      AND p_qty > 0
      AND (COALESCE(products.reserved_qty, 0) >= p_qty OR products.stock_qty >= (p_qty - COALESCE(products.reserved_qty, 0)))
    RETURNING products.id, products.stock_qty, products.reserved_qty, products.sold_qty;
  ELSE
    RETURN QUERY
    UPDATE public.products
    SET
      stock_qty = products.stock_qty - p_qty,
      sold_qty = COALESCE(products.sold_qty, 0) + p_qty,
      updated_at = NOW()
    WHERE products.id = p_product_id
      AND p_qty > 0
      AND products.stock_qty >= p_qty
    RETURNING products.id, products.stock_qty, products.reserved_qty, products.sold_qty;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_product_stock_atomic(p_product_id BIGINT, p_qty INTEGER, p_was_reserved BOOLEAN DEFAULT FALSE)
RETURNS TABLE(id BIGINT, stock_qty INTEGER, reserved_qty INTEGER, sold_qty INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.products
  SET
    stock_qty = products.stock_qty + p_qty,
    reserved_qty = CASE WHEN p_was_reserved THEN GREATEST(0, COALESCE(products.reserved_qty, 0) - p_qty) ELSE COALESCE(products.reserved_qty, 0) END,
    sold_qty = CASE WHEN NOT p_was_reserved THEN GREATEST(0, COALESCE(products.sold_qty, 0) - p_qty) ELSE COALESCE(products.sold_qty, 0) END,
    updated_at = NOW()
  WHERE products.id = p_product_id AND p_qty > 0
  RETURNING products.id, products.stock_qty, products.reserved_qty, products.sold_qty;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage_atomic(p_code TEXT)
RETURNS TABLE(code TEXT, usage INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.coupons
  SET usage = COALESCE(coupons.usage, 0) + 1
  WHERE UPPER(coupons.code) = UPPER(p_code)
    AND (COALESCE(coupons.max_redemptions, 0) <= 0 OR COALESCE(coupons.usage, 0) < coupons.max_redemptions)
  RETURNING coupons.code, coupons.usage;
END;
$$;

-- 12. RELOAD SUPABASE POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
