-- ============================================================================
-- TUXI GLOBAL HUB — MIGRATION 018: SECURE DOCUMENT VAULT & APPLICANT BANKING
-- ============================================================================
-- Purpose:
-- 1. Upgrade documents table with encryption metadata and integrity hash
-- 2. Add banking verification and document linkage columns to rep_applications
-- 3. Add banking verification and document linkage columns to driver_applications
-- 4. Maintain strict private storage invariant (never stored in /public)
-- ============================================================================

-- 1. Upgrade documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_iv VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_tag VARCHAR(64);

-- 2. Upgrade rep_applications with banking and document IDs
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS full_legal_name VARCHAR(255);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS id_document_number VARCHAR(50);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS banking_bank_name VARCHAR(100);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS banking_account_number_masked VARCHAR(50);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS banking_branch_code VARCHAR(20);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS banking_account_holder VARCHAR(255);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS banking_verification_status VARCHAR(50) DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS proof_of_residence_doc_id UUID REFERENCES documents(id);
ALTER TABLE rep_applications ADD COLUMN IF NOT EXISTS id_document_doc_id UUID REFERENCES documents(id);

-- 3. Upgrade driver_applications with banking and document IDs
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS full_legal_name VARCHAR(255);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS banking_bank_name VARCHAR(100);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS banking_account_number_masked VARCHAR(50);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS banking_branch_code VARCHAR(20);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS banking_account_holder VARCHAR(255);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS banking_verification_status VARCHAR(50) DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS id_document_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS proof_of_residence_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS driver_selfie_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS driver_transport_selfie_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS drivers_license_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_roadworthy_doc_id UUID REFERENCES documents(id);
ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS payload_cert_doc_id UUID REFERENCES documents(id);

-- ============================================================================
-- ROLLBACK STRATEGY (Do not execute unless formal rollback authorized):
-- ALTER TABLE documents DROP COLUMN IF EXISTS original_filename;
-- ALTER TABLE documents DROP COLUMN IF EXISTS sha256_hash;
-- ALTER TABLE documents DROP COLUMN IF EXISTS encryption_iv;
-- ALTER TABLE documents DROP COLUMN IF EXISTS encryption_tag;
-- ============================================================================
