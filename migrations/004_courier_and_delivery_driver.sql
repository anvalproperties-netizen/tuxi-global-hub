-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 004
-- Phase 2C: Courier, Delivery Driver Operations, Assignments & Tracking
-- ====================================================================

-- 1. DRIVER PROFILES ENRICHMENT
ALTER TABLE driver_profiles
ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS payout_ready BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. DELIVERIES ENRICHMENT
-- Make order_id nullable to allow standalone Point-to-Point Courier deliveries
ALTER TABLE deliveries ALTER COLUMN order_id DROP NOT NULL;

-- Drop original unique constraint on order_id to allow partial/conditional indexing
DO $$
BEGIN
    ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_order_id_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Partial unique index ensuring only one active delivery per order (if order_id is present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_active_order 
ON deliveries (order_id) 
WHERE order_id IS NOT NULL AND status NOT IN ('CANCELLED', 'FAILED');

-- Add Phase 2C columns to deliveries
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) NOT NULL DEFAULT 'EATS', -- 'EATS' | 'SHOP' | 'COURIER'
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED',
ADD COLUMN IF NOT EXISTS package_description TEXT,
ADD COLUMN IF NOT EXISTS package_category VARCHAR(50),
ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
ADD COLUMN IF NOT EXISTS distance_meters NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_INTEGRATION_PENDING',
ADD COLUMN IF NOT EXISTS quote_id UUID,
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128) UNIQUE,
ADD COLUMN IF NOT EXISTS pickup_code_hash VARCHAR(128),
ADD COLUMN IF NOT EXISTS pickup_code_consumed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_otp_hash VARCHAR(128),
ADD COLUMN IF NOT EXISTS delivery_otp_consumed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS otp_attempt_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS driver_assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS driver_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS arrived_at_pickup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS arrived_at_dropoff_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_type ON deliveries(delivery_type);

-- 3. DELIVERY ASSIGNMENTS (Auditable, Concurrency-Safe Dispatch Lifecycle)
CREATE TABLE IF NOT EXISTS delivery_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'OFFERED', -- 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    decline_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL TRANSACTIONAL INVARIANT: Exactly one active accepted driver per delivery
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_single_active_accepted 
ON delivery_assignments (delivery_id) 
WHERE status = 'ACCEPTED';

-- Driver can have at most one active accepted delivery at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_single_active_accepted 
ON delivery_assignments (driver_id) 
WHERE status = 'ACCEPTED';

CREATE INDEX IF NOT EXISTS idx_deliv_assign_deliv ON delivery_assignments(delivery_id);
CREATE INDEX IF NOT EXISTS idx_deliv_assign_driver ON delivery_assignments(driver_id);

-- 4. DRIVER LOCATIONS (Safe Historical Tracking & Latest Coordinate Persistence)
CREATE TABLE IF NOT EXISTS driver_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
    geom geometry(Point, 4326) NOT NULL,
    accuracy_meters NUMERIC(6, 2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_time 
ON driver_locations(driver_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_locations_geom 
ON driver_locations USING GIST (geom);

-- 5. COURIER QUOTES (Server-Authoritative Pricing Foundation)
CREATE TABLE IF NOT EXISTS courier_quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pickup_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    dropoff_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    pickup_latitude NUMERIC(10, 7) NOT NULL,
    pickup_longitude NUMERIC(10, 7) NOT NULL,
    dropoff_latitude NUMERIC(10, 7) NOT NULL,
    dropoff_longitude NUMERIC(10, 7) NOT NULL,
    distance_meters NUMERIC(10, 2) NOT NULL,
    base_fee_cents INTEGER NOT NULL CHECK (base_fee_cents >= 0),
    distance_fee_cents INTEGER NOT NULL CHECK (distance_fee_cents >= 0),
    service_fee_cents INTEGER NOT NULL CHECK (service_fee_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    pricing_config_version VARCHAR(50) NOT NULL DEFAULT 'DEV_V1',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_quotes_cust ON courier_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_courier_quotes_expiry ON courier_quotes(expires_at);

-- 6. DRIVER EARNINGS (Server-Derived Ledger Foundation)
CREATE TABLE IF NOT EXISTS driver_earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    earning_type VARCHAR(50) NOT NULL DEFAULT 'DELIVERY_COMPLETION',
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'EARNED', -- 'EARNED' | 'REVERSED' | 'PAID'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver ON driver_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_delivery ON driver_earnings(delivery_id);

-- 7. DELIVERY EVENTS ENRICHMENT
ALTER TABLE delivery_events
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50);
