-- ============================================================================
-- TUXI MIGRATION 006: TERMS ACCEPTANCE EVIDENCE & CLICKWRAP INTEGRITY
-- ============================================================================

ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS content_hash VARCHAR(128);
ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS acceptance_method VARCHAR(50) DEFAULT 'CLICKWRAP';
ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS audit_event_id UUID;
ALTER TABLE terms_acceptances ADD COLUMN IF NOT EXISTS rep_profile_id UUID;
ALTER TABLE terms_acceptances ALTER COLUMN signature_hash DROP NOT NULL;
