-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 007
-- Phase 2E: Eats Owner & Shop Owner Operations
-- ====================================================================

-- 1. Operational status and settings on businesses
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS operational_status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (operational_status IN ('OPEN', 'CLOSED', 'PAUSED')),
ADD COLUMN IF NOT EXISTS operational_notes TEXT,
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER NOT NULL DEFAULT 20;

-- 2. Menu Items enhancements
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS dietary_flags TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Inventory Adjustments Table (Auditable inventory ledger)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN ('RESTOCK', 'CORRECTION', 'DAMAGE', 'LOSS', 'RETURN_TO_STOCK')),
    quantity_delta INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    idempotency_key VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_adj_inventory ON inventory_adjustments(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_business ON inventory_adjustments(business_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_created ON inventory_adjustments(created_at);

-- 4. Promotions Table
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    min_order_subtotal_cents INTEGER NOT NULL DEFAULT 0,
    max_discount_cents INTEGER,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_business_promo_code UNIQUE (business_id, code)
);

CREATE INDEX IF NOT EXISTS idx_promo_biz ON promotions(business_id);
CREATE INDEX IF NOT EXISTS idx_promo_active ON promotions(business_id, is_active);

-- 5. Business Staff Access Table (Foundation)
CREATE TABLE IF NOT EXISTS business_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staff_role VARCHAR(50) NOT NULL CHECK (staff_role IN ('OWNER', 'MANAGER', 'ORDER_STAFF', 'CATALOGUE_STAFF')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_biz ON business_staff(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON business_staff(user_id);
