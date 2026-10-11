-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 011
-- Phase 2F: Admin & AI Command Center Core Schema
-- ====================================================================

-- 1. Admin MFA Credentials & Verified Sessions
CREATE TABLE IF NOT EXISTS admin_mfa_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  secret VARCHAR(255) NOT NULL,
  is_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  backup_codes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_mfa_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mfa_token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_sessions_token ON admin_mfa_sessions(mfa_token);
CREATE INDEX IF NOT EXISTS idx_mfa_sessions_user ON admin_mfa_sessions(user_id);

-- 2. Financial Policies & Commission Governance
CREATE TABLE IF NOT EXISTS financial_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_key VARCHAR(100) NOT NULL UNIQUE,
  value_numeric NUMERIC(10,4) NOT NULL,
  currency VARCHAR(10) DEFAULT 'GBP',
  description TEXT,
  proposed_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_policies_key ON financial_policies(policy_key);
CREATE INDEX IF NOT EXISTS idx_fin_policies_status ON financial_policies(status);

-- 3. Risk Investigations & Fraud Oversight
CREATE TABLE IF NOT EXISTS risk_investigations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number VARCHAR(50) NOT NULL UNIQUE,
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('USER', 'BUSINESS', 'DRIVER', 'ORDER', 'TRANSACTION')),
  target_id UUID NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED')),
  action_taken VARCHAR(100),
  notes TEXT,
  opened_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_target ON risk_investigations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_risk_status ON risk_investigations(status);

-- 4. AI-Assisted Operational Recommendations with Human Approval Gates
CREATE TABLE IF NOT EXISTS ai_operational_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(50) NOT NULL CHECK (category IN ('SURGE_PRICING', 'RISK_ANOMALY', 'MERCHANT_DISCOVERY', 'TERRITORY_BALANCE', 'DRIVER_CAPACITY')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  proposed_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.85,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_recom_status ON ai_operational_recommendations(status);

-- 5. Territory Disputes Oversight
CREATE TABLE IF NOT EXISTS territory_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  claimant_rep_id UUID NOT NULL REFERENCES users(id),
  disputed_with_rep_id UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED_AWARDED', 'RESOLVED_REJECTED')),
  resolved_by UUID REFERENCES users(id),
  awarded_rep_id UUID REFERENCES users(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territory_disputes_biz ON territory_disputes(business_id);
CREATE INDEX IF NOT EXISTS idx_territory_disputes_status ON territory_disputes(status);

-- 6. Platform System Settings & Emergency Controls
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
