-- ============================================================================
-- TUXI MIGRATION 013: PHASE 2G EXTERNAL INTEGRATIONS, PAYOUTS & RELEASE READINESS
-- Enforces provider lifecycle states (NOT_CONFIGURED, SANDBOX, VERIFIED, PRODUCTION_ENABLED, SUSPENDED),
-- payment webhooks, payout ledgers, telematics privacy, notifications, and AI operational tasks.
-- ============================================================================

-- 1. Integration Providers Registry
CREATE TABLE IF NOT EXISTS integration_providers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- 'PAYMENT_GATEWAY', 'MAPS_AND_ROUTING', 'NOTIFICATIONS', 'AI_INTELLIGENCE', 'PAYOUT_DISBURSEMENT'
    state VARCHAR(30) NOT NULL DEFAULT 'NOT_CONFIGURED' CHECK (state IN ('NOT_CONFIGURED', 'SANDBOX', 'VERIFIED', 'PRODUCTION_ENABLED', 'SUSPENDED')),
    is_production_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    config_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    masked_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    encrypted_secrets TEXT,
    health_status VARCHAR(30) NOT NULL DEFAULT 'NOT_CHECKED',
    last_health_check_at TIMESTAMPTZ,
    operator_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Integration Providers in Safe Controlled States
INSERT INTO integration_providers (id, name, provider_type, state, is_production_authorized, config_metadata, masked_credentials, operator_notes)
VALUES
    ('peach_payments', 'Peach Payments (South Africa)', 'PAYMENT_GATEWAY', 'SANDBOX', FALSE, '{"currency": "ZAR", "supported_methods": ["CARD", "EFT_SECURE"], "sandbox_url": "https://testbox-secure.peachpayments.com"}'::jsonb, '{"entity_id": "8a8294...test", "webhook_secret": "whsec_peach_test_***"}'::jsonb, 'Sandbox adapter ready for controlled verification; production activation requires operator authorization.'),
    ('stripe', 'Stripe Multi-Currency Gateway', 'PAYMENT_GATEWAY', 'SANDBOX', FALSE, '{"currency": "USD", "supported_currencies": ["USD", "EUR", "GBP", "ZAR"], "sandbox_mode": true}'::jsonb, '{"publishable_key": "pk_test_***51A", "webhook_secret": "whsec_stripe_test_***"}'::jsonb, 'Sandbox adapter ready; live billing blocked until authorized.'),
    ('google_maps', 'Google Maps Platform', 'MAPS_AND_ROUTING', 'SANDBOX', FALSE, '{"services": ["Geocoding", "DistanceMatrix", "RoutesAPI", "Places"]}'::jsonb, '{"api_key": "AIzaSy...DEMO"}'::jsonb, 'Connected to demo/sandbox API key; production key requires operator deployment.'),
    ('unified_notifications', 'TUXI Unified Notification Dispatcher', 'NOTIFICATIONS', 'SANDBOX', FALSE, '{"channels": ["EMAIL", "SMS", "WHATSAPP", "PUSH_WEB", "PUSH_MOBILE"], "default_locale": "en-ZA"}'::jsonb, '{"sms_sender": "TUXI", "email_sender": "noreply@tuxi.co.za"}'::jsonb, 'All notifications logged safely to database audit trail in sandbox mode.'),
    ('gemini_ai', 'Gemini AI Operational Intelligence', 'AI_INTELLIGENCE', 'SANDBOX', FALSE, '{"model": "gemini-2.5-flash", "advisory_only": true, "max_temperature": 0.2}'::jsonb, '{"api_key": "AIzaSy...GEMINI_KEY"}'::jsonb, 'Strict advisory-only mode; cannot trigger direct financial mutations.'),
    ('bank_eft_payouts', 'Authoritative Bank EFT Disbursements', 'PAYOUT_DISBURSEMENT', 'SANDBOX', FALSE, '{"currency": "ZAR", "batch_processing": true, "cutoff_time": "14:00"}'::jsonb, '{"clearing_code": "ZA-STB-01"}'::jsonb, 'Payout batches prepared from PostgreSQL ledgers; real bank transmissions hold-protected.')
ON CONFLICT (id) DO NOTHING;

-- 2. Payment Webhook Events (Deduplication & Audit Trail)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id VARCHAR(64) NOT NULL REFERENCES integration_providers(id),
    event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'REJECTED')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_provider_event ON payment_webhook_events(provider_id, event_id);

-- 3. Payout Accounts (Drivers, Merchants, Reps)
CREATE TABLE IF NOT EXISTS payout_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_type VARCHAR(30) NOT NULL CHECK (beneficiary_type IN ('DRIVER', 'MERCHANT', 'REP')),
    account_holder_name VARCHAR(150) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    account_number_masked VARCHAR(50) NOT NULL,
    branch_code VARCHAR(20) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    hold_status BOOLEAN NOT NULL DEFAULT FALSE,
    hold_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_accounts_user ON payout_accounts(user_id);

-- 4. Payout Batches
CREATE TABLE IF NOT EXISTS payout_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_reference VARCHAR(64) NOT NULL UNIQUE,
    provider_id VARCHAR(64) NOT NULL REFERENCES integration_providers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'SETTLED', 'FAILED', 'CANCELLED')),
    total_amount_cents BIGINT NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    notes TEXT,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Payout Items
CREATE TABLE IF NOT EXISTS payout_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES payout_batches(id) ON DELETE CASCADE,
    beneficiary_user_id UUID NOT NULL REFERENCES users(id),
    payout_account_id UUID REFERENCES payout_accounts(id),
    beneficiary_role VARCHAR(30) NOT NULL CHECK (beneficiary_role IN ('DRIVER', 'MERCHANT', 'REP')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    reference VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'HOLD')),
    hold_reason TEXT,
    provider_tx_id VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_items_batch ON payout_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_user ON payout_items(beneficiary_user_id);

-- 6. Driver Telematics Pings (Privacy Protected, Strict Retention)
CREATE TABLE IF NOT EXISTS driver_telematics_pings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    geom GEOMETRY(Point, 4326),
    speed_kmh NUMERIC(5, 2),
    heading_degrees NUMERIC(5, 2),
    accuracy_meters NUMERIC(6, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_telematics_driver ON driver_telematics_pings(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_telematics_delivery ON driver_telematics_pings(delivery_id);

-- Trigger to automatically populate PostGIS geom from lat/lng
CREATE OR REPLACE FUNCTION set_telematics_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_telematics_geom ON driver_telematics_pings;
CREATE TRIGGER trg_set_telematics_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON driver_telematics_pings
FOR EACH ROW
EXECUTE FUNCTION set_telematics_geom();

-- 7. Unified Notification Dispatches
CREATE TABLE IF NOT EXISTS notification_dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH_WEB', 'PUSH_MOBILE')),
    recipient VARCHAR(255) NOT NULL,
    template_key VARCHAR(100) NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'SENT' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED')),
    provider_name VARCHAR(64) NOT NULL,
    provider_message_id VARCHAR(150),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_recipient ON notification_dispatches(recipient);
CREATE INDEX IF NOT EXISTS idx_notification_template ON notification_dispatches(template_key);

-- 8. AI Operational Tasks (Advisory Review Ledger)
CREATE TABLE IF NOT EXISTS ai_operational_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type VARCHAR(64) NOT NULL,
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    advisory_output JSONB NOT NULL DEFAULT '{}'::jsonb,
    requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
    approval_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    execution_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_operational_tasks(approval_status);
