-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 002
-- Customer Profile Enrichment, Addresses & Eats Expansion
-- ====================================================================

-- 1. ADD ADDITIONAL ORDER STATUS ENUMS
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'PAYMENT_AUTHORISED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNED';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'PICKED_UP';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'REFUND_PENDING';

-- 2. CUSTOMER PROFILES ENRICHMENT
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"email": true, "sms": true, "push": true}'::jsonb,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. ADDRESSES ENRICHMENT
ALTER TABLE addresses
ADD COLUMN IF NOT EXISTS label VARCHAR(50) NOT NULL DEFAULT 'Home',
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 4. BUSINESSES ENRICHMENT
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 5. MENU ITEMS ENRICHMENT
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 6. ORDERS ENRICHMENT
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 7. RE-SEED TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
    CREATE TRIGGER update_customer_profiles_modtime
        BEFORE UPDATE ON customer_profiles
        FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TRIGGER update_addresses_modtime
        BEFORE UPDATE ON addresses
        FOR EACH ROW EXECUTE PROCEDURE update_timestamp_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;
