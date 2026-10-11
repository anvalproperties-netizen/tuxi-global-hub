-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 001
-- PostgreSQL 15+ / PostGIS Compatible Schema
-- Monotonic, Normalized, Strongly Typed with UUIDs and Cents Money Units
-- ====================================================================

-- 1. EXTENSIONS (PostGIS & UUID generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS & DOMAINS
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'CUSTOMER',
        'TUXI_DELIVERY_DRIVER',
        'TUXI_REP',
        'TUXI_EATS_OWNER',
        'TUXI_SHOP_OWNER',
        'ADMIN',
        'SUPER_ADMIN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE business_type_enum AS ENUM ('EATS', 'SHOP', 'COURIER_HUB');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE business_status_enum AS ENUM (
        'PENDING_VERIFICATION',
        'UNDER_REVIEW',
        'APPROVED',
        'SUSPENDED',
        'REJECTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE order_status_enum AS ENUM (
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'DISPATCHED',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM (
        'INITIATED',
        'AUTHORISED',
        'CAPTURED',
        'FAILED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
        'DISPUTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE commission_status_enum AS ENUM (
        'PENDING',
        'EARNED',
        'REVERSED',
        'PARTIALLY_REVERSED',
        'PAID',
        'DISPUTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM (
        'PENDING',
        'VERIFIED',
        'REJECTED',
        'REVOKED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(user_id, role)
);

-- 4. TERMS & COMPLIANCE LEDGER
CREATE TABLE IF NOT EXISTS terms_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_role user_role_enum NOT NULL,
    version_tag VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_hash VARCHAR(128) NOT NULL,
    full_text TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_current BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS terms_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version_id UUID NOT NULL REFERENCES terms_versions(id),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    signature_hash VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    street_line_1 VARCHAR(255) NOT NULL,
    street_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(30) NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geom geometry(Point, 4326),
    normalized_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. CUSTOMER PROFILES
CREATE TABLE IF NOT EXISTS customer_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    default_address_id UUID REFERENCES addresses(id),
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    loyalty_tier VARCHAR(50) NOT NULL DEFAULT 'BRONZE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. REP PROFILES & TERRITORIES
CREATE TABLE IF NOT EXISTS rep_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    birth_date DATE NOT NULL,
    has_mobile_phone BOOLEAN NOT NULL DEFAULT false,
    has_mobile_data BOOLEAN NOT NULL DEFAULT false,
    has_own_transport BOOLEAN NOT NULL DEFAULT false,
    transport_details VARCHAR(255),
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    hub_address_id UUID NOT NULL REFERENCES addresses(id),
    territory_radius_km NUMERIC(6, 3) NOT NULL DEFAULT 20.000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rep_age_minimum CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years')
);

CREATE TABLE IF NOT EXISTS rep_territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_profile_id UUID NOT NULL UNIQUE REFERENCES rep_profiles(id) ON DELETE CASCADE,
    hub_latitude NUMERIC(10, 7) NOT NULL,
    hub_longitude NUMERIC(10, 7) NOT NULL,
    hub_geom geometry(Point, 4326) NOT NULL,
    radius_meters NUMERIC(10, 2) NOT NULL DEFAULT 20000.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. BUSINESSES & ATTRIBUTION
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type business_type_enum NOT NULL,
    name VARCHAR(255) NOT NULL,
    legal_entity_name VARCHAR(255) NOT NULL,
    tax_or_vat_id VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50) NOT NULL,
    address_id UUID NOT NULL REFERENCES addresses(id),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    status business_status_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
    opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_business_tax_id UNIQUE (tax_or_vat_id),
    CONSTRAINT uq_business_phone UNIQUE (contact_phone)
);

CREATE TABLE IF NOT EXISTS business_owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_primary_owner BOOLEAN NOT NULL DEFAULT true,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, user_id)
);

CREATE TABLE IF NOT EXISTS eats_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    cuisine_types TEXT[] NOT NULL DEFAULT '{}',
    prep_time_minutes INTEGER NOT NULL DEFAULT 20,
    price_rating VARCHAR(5) NOT NULL DEFAULT '$$'
);

CREATE TABLE IF NOT EXISTS shop_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    store_category VARCHAR(100) NOT NULL,
    fulfillment_mode VARCHAR(50) NOT NULL DEFAULT 'MERCHANT_PACK'
);

CREATE TABLE IF NOT EXISTS rep_business_attributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_profile_id UUID NOT NULL REFERENCES rep_profiles(id),
    business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE RESTRICT,
    originated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attribution_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    distance_at_origination_km NUMERIC(6, 3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PRODUCTS & MENUS
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_item_modifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    group_name VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    extra_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (extra_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    category VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_id, sku)
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_sku VARCHAR(100) NOT NULL UNIQUE,
    variant_name VARCHAR(100) NOT NULL,
    price_delta_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. DRIVERS & DELIVERIES
CREATE TABLE IF NOT EXISTS driver_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100) NOT NULL UNIQUE,
    vehicle_type VARCHAR(50) NOT NULL,
    vehicle_plate VARCHAR(50) NOT NULL UNIQUE,
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
    is_online BOOLEAN NOT NULL DEFAULT false,
    current_latitude NUMERIC(10, 7),
    current_longitude NUMERIC(10, 7),
    current_geom geometry(Point, 4326),
    last_ping_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customer_profiles(id),
    business_id UUID NOT NULL REFERENCES businesses(id),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
    service_fee_cents INTEGER NOT NULL CHECK (service_fee_cents >= 0),
    tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    status order_status_enum NOT NULL DEFAULT 'PLACED',
    delivery_address_id UUID NOT NULL REFERENCES addresses(id),
    special_instructions TEXT,
    idempotency_key VARCHAR(128) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL, -- 'MENU_ITEM' | 'PRODUCT'
    item_id UUID NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    selected_modifiers JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES driver_profiles(id),
    pickup_address_id UUID NOT NULL REFERENCES addresses(id),
    dropoff_address_id UUID NOT NULL REFERENCES addresses(id),
    dispatched_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    proof_photo_url TEXT,
    recipient_signature_hash VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_data JSONB DEFAULT '{}'::jsonb
);

-- 12. PAYMENTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    status payment_status_enum NOT NULL DEFAULT 'INITIATED',
    payment_provider VARCHAR(50) NOT NULL DEFAULT 'PAYMENT_INTEGRATION_PENDING',
    provider_transaction_id VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'CHARGE' | 'REFUND' | 'REVERSAL'
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    reason TEXT NOT NULL,
    refunded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_type VARCHAR(50) NOT NULL, -- 'BUSINESS' | 'DRIVER' | 'REP'
    recipient_id UUID NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    processed_at TIMESTAMPTZ,
    payout_batch_ref VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. COMMISSION RULES & LEDGER (TUXI REP SPEC: UP TO 3% CONFIGURABLE)
CREATE TABLE IF NOT EXISTS commission_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_version INTEGER NOT NULL DEFAULT 1,
    name VARCHAR(150) NOT NULL,
    target_role user_role_enum NOT NULL DEFAULT 'TUXI_REP',
    percentage_rate NUMERIC(5, 4) NOT NULL CHECK (percentage_rate >= 0.0000 AND percentage_rate <= 0.0300), -- max 3.0000%
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    business_type business_type_enum,
    country_code VARCHAR(3),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_profile_id UUID NOT NULL REFERENCES rep_profiles(id),
    business_id UUID NOT NULL REFERENCES businesses(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    qualifying_amount_cents INTEGER NOT NULL CHECK (qualifying_amount_cents >= 0),
    applied_rule_id UUID NOT NULL REFERENCES commission_rules(id),
    applied_percentage NUMERIC(5, 4) NOT NULL,
    commission_cents INTEGER NOT NULL, -- can be negative for compensating reversals
    status commission_status_enum NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. DOCUMENTS, APPLICATIONS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_id UUID NOT NULL REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    storage_path VARCHAR(500) NOT NULL, -- Private storage path, NOT in /public
    file_mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id UUID NOT NULL REFERENCES users(id),
    application_type VARCHAR(50) NOT NULL, -- 'REP' | 'EATS_MERCHANT' | 'SHOP_MERCHANT' | 'DRIVER'
    target_business_id UUID REFERENCES businesses(id),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    form_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    business_id UUID REFERENCES businesses(id),
    initiator_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(150) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(128) PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id),
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. INDEXES FOR PERFORMANCE AND INTEGRITY
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_rep ON commission_ledger(rep_profile_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_order ON commission_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_rep_attribution_rep ON rep_business_attributions(rep_profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
