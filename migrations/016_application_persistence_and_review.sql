-- Phase C1: Secure Application Persistence & Administrative Review Migration

-- 1. Rep Applications Table
CREATE TABLE IF NOT EXISTS rep_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW', -- 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED'
  birth_date DATE NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  has_mobile_phone BOOLEAN NOT NULL DEFAULT true,
  has_mobile_data BOOLEAN NOT NULL DEFAULT true,
  has_own_transport BOOLEAN NOT NULL DEFAULT true,
  transport_details VARCHAR(64) NOT NULL,
  residential_address_line1 VARCHAR(255) NOT NULL,
  residential_city VARCHAR(100) NOT NULL,
  residential_postal_code VARCHAR(32) NOT NULL,
  residential_country VARCHAR(10) NOT NULL DEFAULT 'ZA',
  proof_of_residence_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  hub_street_line1 VARCHAR(255) NOT NULL,
  hub_city VARCHAR(100) NOT NULL,
  hub_postal_code VARCHAR(32) NOT NULL,
  hub_latitude NUMERIC(10, 7) NOT NULL,
  hub_longitude NUMERIC(10, 7) NOT NULL,
  territory_radius_km NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  terms_version_id VARCHAR(64) NOT NULL DEFAULT 'v2.1-rep-terms-2026',
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banking_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  required_documents_status JSONB NOT NULL DEFAULT '{"id_document": "SUBMITTED", "proof_of_residence": "UNVERIFIED", "banking_verification": "UNVERIFIED"}'::jsonb,
  rejection_reason TEXT,
  review_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rep_application_user UNIQUE (user_id),
  CONSTRAINT chk_rep_territory_radius CHECK (territory_radius_km <= 10.00)
);

-- 2. Driver Applications Table
CREATE TABLE IF NOT EXISTS driver_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW', -- 'DRAFT' | 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED'
  transport_type VARCHAR(32) NOT NULL, -- 'MOTORCYCLE' | 'CAR' | 'BAKKIE' | 'LIGHT_TRUCK'
  license_number VARCHAR(64) NOT NULL,
  vehicle_plate VARCHAR(32) NOT NULL,
  vehicle_make_model VARCHAR(128) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  id_document_number VARCHAR(64) NOT NULL,
  residential_address_line1 VARCHAR(255),
  residential_city VARCHAR(100),
  residential_postal_code VARCHAR(32),
  proof_of_residence_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  safety_gear_confirmed BOOLEAN NOT NULL DEFAULT true,
  background_check_consent BOOLEAN NOT NULL DEFAULT true,
  safety_charter_consent BOOLEAN NOT NULL DEFAULT true,
  roadworthy_insurance_confirmed BOOLEAN NOT NULL DEFAULT true,
  facial_liveness_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  transport_selfie_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  vehicle_documents_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
  banking_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
  required_documents_status JSONB NOT NULL DEFAULT '{"id_document": "SUBMITTED", "drivers_license": "SUBMITTED", "proof_of_residence": "UNVERIFIED", "vehicle_roadworthy": "PENDING_REVIEW", "banking_verification": "UNVERIFIED"}'::jsonb,
  rejection_reason TEXT,
  review_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_application_user UNIQUE (user_id),
  CONSTRAINT chk_driver_transport_allowed CHECK (
    transport_type IN ('MOTORCYCLE', 'CAR', 'BAKKIE', 'LIGHT_TRUCK')
  )
);

CREATE INDEX IF NOT EXISTS idx_rep_apps_status ON rep_applications(status);
CREATE INDEX IF NOT EXISTS idx_driver_apps_status ON driver_applications(status);
