-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 009
-- Phase 2E: Explicit Merchant Commercial Configuration & Commission Rules
-- ====================================================================

-- 1. Support flexible target roles in commission_rules
ALTER TABLE commission_rules ALTER COLUMN target_role TYPE VARCHAR(50);

-- 2. Relax rep-only 3% check so explicit merchant platform rates (up to 100%) can be configured
ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_percentage_rate_check;
ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_percentage_rate_check CHECK (percentage_rate >= 0.0000 AND percentage_rate <= 1.0000);
