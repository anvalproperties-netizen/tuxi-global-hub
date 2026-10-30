-- ============================================================================
-- TUXI GLOBAL HUB — MIGRATION 017: STRICT 1.0% REP COMMISSION INVARIANT
-- ============================================================================
-- Purpose:
-- Enforce immutable commercial invariant:
-- 1. Rep commission on eligible Rep-attributed product subtotal is EXACTLY 1.0% (0.0100).
-- 2. TUXI Customer Admin Fee is 3.0% (0.0300).
-- 3. TUXI retention on Rep-attributed transactions is 2.0% (0.0200).
-- 4. TUXI retention on unattributed transactions is 3.0% (0.0300).
-- 5. Merchant sales commission is 0.0%.
-- 6. Rep commission on delivery fees, service fees, and tips is strictly 0.0%.
-- ============================================================================

-- 1. Drop obsolete flexible <= 3% constraints
ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_rep_max_3_percent;
ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_rep_exact_1_percent;

-- 2. Add strict invariant: Rep commission rate can ONLY be exactly 0.0100 (1.0%)
ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_rep_exact_1_percent
  CHECK (target_role != 'TUXI_REP' OR percentage_rate = 0.0100);

-- 3. Drop obsolete flexible cap constraint in financial_policies
ALTER TABLE financial_policies DROP CONSTRAINT IF EXISTS financial_policies_rep_cap_max_3_percent;
ALTER TABLE financial_policies DROP CONSTRAINT IF EXISTS financial_policies_rep_exact_1_percent;

-- 4. Add strict invariant for Rep policies: value_numeric must be exactly 0.0100
ALTER TABLE financial_policies ADD CONSTRAINT financial_policies_rep_exact_1_percent
  CHECK (policy_key NOT LIKE 'REP_%' OR value_numeric = 0.0100);

-- 5. Update existing active TUXI Rep rule to 0.0100 (1.0%)
UPDATE commission_rules 
SET percentage_rate = 0.0100,
    name = 'Standard TUXI Rep Qualifying Sales Rule (1.0% Exact)'
WHERE target_role = 'TUXI_REP' AND is_active = true;

-- ============================================================================
-- ROLLBACK STRATEGY (Do not execute unless formal rollback authorized):
-- ALTER TABLE commission_rules DROP CONSTRAINT IF EXISTS commission_rules_rep_exact_1_percent;
-- ALTER TABLE financial_policies DROP CONSTRAINT IF EXISTS financial_policies_rep_exact_1_percent;
-- ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_rep_max_3_percent CHECK (target_role != 'TUXI_REP' OR percentage_rate <= 0.0300);
-- ============================================================================
