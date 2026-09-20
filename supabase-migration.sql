-- ==============================================================================
-- SABJIES SUPABASE PRODUCTION PERSISTENCE MIGRATION
-- Run this in Supabase Dashboard -> SQL Editor
-- This migration is completely non-destructive and idempotent (safe to run repeatedly).
-- ==============================================================================

-- 1. Ensure Products Table has Weight Slabs and Pricing Mode columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_price_per_kg NUMERIC(10, 2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'auto';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_slabs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Populate base_price_per_kg from sp where empty
UPDATE public.products SET base_price_per_kg = sp WHERE base_price_per_kg IS NULL;

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

-- 6. Add payment discount tracking columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_value NUMERIC(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_discount_label TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_discount NUMERIC(10, 2) DEFAULT 0;

