-- ============================================================================
-- TUXI GLOBAL HUB — MIGRATION 015: PHYSICAL SKU ATTRIBUTES & CARGO METRICS
-- Authoritative schema extension for delivery vehicle class eligibility,
-- driver payload capacity certification, and append-only order payload assessments.
-- ============================================================================

-- 1. Extend products table with physical metrics
ALTER TABLE products
ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT false;

-- Named constraints on products (Idempotent execution via DO block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_weight_grams_range') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_weight_grams_range 
            CHECK (weight_grams IS NULL OR (weight_grams > 0 AND weight_grams <= 2000000));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_dimensions_range') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_dimensions_range 
            CHECK ((length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL) OR 
                   (length_cm > 0 AND length_cm <= 500.00 AND 
                    width_cm > 0 AND width_cm <= 500.00 AND 
                    height_cm > 0 AND height_cm <= 500.00));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_dimensions_complete') THEN
        ALTER TABLE products ADD CONSTRAINT chk_products_dimensions_complete 
            CHECK ((length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL) OR 
                   (length_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL));
    END IF;
END $$;

-- 2. Extend product_variants with Nullable Overrides (distinguishes explicit false from inherit)
ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variants_weight_grams_range') THEN
        ALTER TABLE product_variants ADD CONSTRAINT chk_variants_weight_grams_range 
            CHECK (weight_grams IS NULL OR (weight_grams > 0 AND weight_grams <= 2000000));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variants_dimensions_range') THEN
        ALTER TABLE product_variants ADD CONSTRAINT chk_variants_dimensions_range 
            CHECK ((length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL) OR 
                   (length_cm > 0 AND length_cm <= 500.00 AND 
                    width_cm > 0 AND width_cm <= 500.00 AND 
                    height_cm > 0 AND height_cm <= 500.00));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variants_dimensions_complete') THEN
        ALTER TABLE product_variants ADD CONSTRAINT chk_variants_dimensions_complete 
            CHECK ((length_cm IS NULL AND width_cm IS NULL AND height_cm IS NULL) OR 
                   (length_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL));
    END IF;
END $$;

-- 3. Extend driver_profiles with verified capacity certification
ALTER TABLE driver_profiles
ADD COLUMN IF NOT EXISTS verified_payload_kg INTEGER,
ADD COLUMN IF NOT EXISTS cargo_length_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS cargo_width_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS cargo_height_cm NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS capacity_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS capacity_verified_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS capacity_certificate_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS capacity_evidence_doc_url TEXT,
ADD COLUMN IF NOT EXISTS capacity_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS capacity_revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS capacity_revocation_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_verified_payload_positive') THEN
        ALTER TABLE driver_profiles ADD CONSTRAINT chk_driver_verified_payload_positive 
            CHECK (verified_payload_kg IS NULL OR (verified_payload_kg > 0 AND verified_payload_kg <= 10000));
    END IF;
END $$;

-- 4. Create immutable append-only order payload assessments table
CREATE TABLE IF NOT EXISTS order_payload_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    assessment_status VARCHAR(50) NOT NULL, -- 'VERIFIED_COMPLETE', 'UNASSESSED_MISSING_ATTRIBUTES'
    known_weight_grams INTEGER NOT NULL DEFAULT 0,
    unknown_item_count INTEGER NOT NULL DEFAULT 0,
    total_actual_weight_grams INTEGER, -- NULL if unknown_item_count > 0; non-null ONLY if 100% items verified
    max_length_cm NUMERIC(6,2),
    max_width_cm NUMERIC(6,2),
    max_height_cm NUMERIC(6,2),
    total_volume_cm3 NUMERIC(12,2),
    parcel_count INTEGER NOT NULL DEFAULT 1,
    has_bulk_item BOOLEAN NOT NULL DEFAULT false,
    has_wholesale_item BOOLEAN NOT NULL DEFAULT false,
    has_unspecified_attributes BOOLEAN NOT NULL DEFAULT false,
    eligible_vehicle_classes JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ["CAR", "BAKKIE"]
    required_vehicle_class VARCHAR(50) NOT NULL, -- 'MOTORCYCLE', 'CAR', 'BAKKIE', 'BAKKIE_VERIFIED_HEAVY', 'MANUAL_ASSESSMENT'
    line_snapshots JSONB NOT NULL,
    assessed_by_actor_id UUID REFERENCES users(id),
    assessed_by_role VARCHAR(50) NOT NULL DEFAULT 'SYSTEM', -- 'SYSTEM', 'MERCHANT', 'OPERATIONS_ADMIN'
    amendment_reason TEXT,
    evidence_notes TEXT,
    previous_assessment_id UUID REFERENCES order_payload_assessments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_assessment_version UNIQUE (order_id, version),
    CONSTRAINT chk_amendment_reason CHECK (version = 1 OR amendment_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_order_payload_assessments_order_version 
    ON order_payload_assessments (order_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_products_physical_routing 
    ON products (weight_grams, is_bulk, is_wholesale);
CREATE INDEX IF NOT EXISTS idx_product_variants_physical_routing 
    ON product_variants (product_id, weight_grams, is_bulk);
