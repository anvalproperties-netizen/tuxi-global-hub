-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 008
-- Phase 2E: Products Concurrency Version & Merchant Operations Enrichment
-- ====================================================================

-- 1. Optimistic locking on products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 2. Ready & handoff tracking on orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS packed_item_ids JSONB DEFAULT '[]'::jsonb;

-- 3. Promo code tracking on orders (for promotional discounts)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
