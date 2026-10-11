-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 003
-- Shop Catalogue, Variants, Authoritative Inventory & Reservations
-- ====================================================================

-- 1. PRODUCTS ENRICHMENT
ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER CHECK (sale_price_cents >= 0),
ADD COLUMN IF NOT EXISTS is_on_sale BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. PRODUCT VARIANTS ENRICHMENT
ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER CHECK (sale_price_cents >= 0),
ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. INVENTORY ENRICHMENT
ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- Drop single product_id unique constraint so inventory can be tracked per product OR per variant
DO $$ 
BEGIN
    ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_product_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create composite unique index for product & variant inventory
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_prod_var ON inventory(product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. INVENTORY RESERVATIONS TABLE
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'RESERVED', -- 'RESERVED' | 'COMMITTED' | 'RELEASED'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_res_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_inventory ON inventory_reservations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_status ON inventory_reservations(status);

-- 5. ORDER ITEMS ENRICHMENT (SKU snapshot, variant snapshot)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
ADD COLUMN IF NOT EXISTS variant_attributes JSONB DEFAULT '{}'::jsonb;

-- 6. ORDERS ENRICHMENT
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'EATS';
