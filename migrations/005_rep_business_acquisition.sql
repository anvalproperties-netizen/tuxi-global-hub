-- ============================================================================
-- TUXI MIGRATION 005: REP BUSINESS ACQUISITION & ONBOARDING (PHASE 2D)
-- ============================================================================

-- 1. Extend business_status_enum with Phase 2D statuses if not already present
ALTER TYPE business_status_enum ADD VALUE IF NOT EXISTS 'PENDING_ADMIN_VERIFICATION';
ALTER TYPE business_status_enum ADD VALUE IF NOT EXISTS 'POSSIBLE_DUPLICATE';
ALTER TYPE business_status_enum ADD VALUE IF NOT EXISTS 'REQUIRES_REVIEW';

-- 2. Business Acquisition Drafts
CREATE TABLE IF NOT EXISTS business_acquisition_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rep_profile_id UUID NOT NULL REFERENCES rep_profiles(id) ON DELETE CASCADE,
  business_type VARCHAR(50) NOT NULL CHECK (business_type IN ('EATS', 'SHOP')),
  business_name VARCHAR(255) NOT NULL,
  legal_entity_name VARCHAR(255),
  tax_or_vat_id VARCHAR(100),
  owner_name VARCHAR(255) NOT NULL,
  owner_phone VARCHAR(50) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  opening_hours JSONB DEFAULT '{}'::jsonb,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state_province VARCHAR(100),
  postal_code VARCHAR(20) NOT NULL,
  country_code VARCHAR(10) NOT NULL DEFAULT 'ZAF',
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  geom GEOMETRY(Point, 4326),
  menu_or_product_draft JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_ADMIN_VERIFICATION', 'POSSIBLE_DUPLICATE', 'REQUIRES_REVIEW', 'APPROVED', 'REJECTED')),
  duplicate_reason TEXT,
  owner_consent_id UUID,
  submitted_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_drafts_rep ON business_acquisition_drafts(rep_profile_id);
CREATE INDEX IF NOT EXISTS idx_acquisition_drafts_status ON business_acquisition_drafts(status);
CREATE INDEX IF NOT EXISTS idx_acquisition_drafts_geom ON business_acquisition_drafts USING gist(geom);

-- 3. Business Owner Consents (Cryptographically Hashed OTPs & Audit Records)
CREATE TABLE IF NOT EXISTS business_owner_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acquisition_draft_id UUID REFERENCES business_acquisition_drafts(id) ON DELETE CASCADE,
  owner_phone VARCHAR(50) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  is_consumed BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_consents_draft ON business_owner_consents(acquisition_draft_id);

-- 4. Business Acquisition Documents
CREATE TABLE IF NOT EXISTS acquisition_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  acquisition_draft_id UUID REFERENCES business_acquisition_drafts(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id),
  document_type VARCHAR(100) NOT NULL CHECK (document_type IN ('BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'ID_DOCUMENT', 'LEASE_AGREEMENT', 'HEALTH_CERTIFICATE', 'OTHER')),
  storage_path VARCHAR(500) NOT NULL,
  file_mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'DOCUMENT_UPLOADED' CHECK (verification_status IN ('DOCUMENT_UPLOADED', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED')),
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acq_docs_draft ON acquisition_documents(acquisition_draft_id);
CREATE INDEX IF NOT EXISTS idx_acq_docs_uploader ON acquisition_documents(uploader_id);
