-- TUXI Phase 2F: Immutable Rep Commission Ceiling & 128-Bit MFA Recovery Security
-- 1. Database-level invariant: Rep commission rate can NEVER exceed 3.0% (0.0300)
ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_rep_max_3_percent;
ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_rep_max_3_percent 
  CHECK (target_role != 'TUXI_REP' OR percentage_rate <= 0.0300);

-- 2. Database-level invariant: Financial policy for Rep commission can NEVER exceed 3.0% (0.0300)
ALTER TABLE financial_policies DROP CONSTRAINT IF EXISTS financial_policies_rep_cap_max_3_percent;
ALTER TABLE financial_policies ADD CONSTRAINT financial_policies_rep_cap_max_3_percent 
  CHECK (policy_key NOT LIKE 'REP_%' OR value_numeric <= 0.0300);

-- 3. Invalidate any legacy weak 32-bit backup codes in admin_mfa_credentials; administrators re-enroll with 128-bit recovery codes
UPDATE admin_mfa_credentials 
SET backup_codes = '{}'
WHERE array_length(backup_codes, 1) > 0;
