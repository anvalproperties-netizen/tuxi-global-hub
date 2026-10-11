-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 010
-- Phase 2F: Gemini AI Grounding, Extracted Menus & AI Audit Logs
-- ====================================================================

-- 1. AI Extraction Drafts Table (Eats Menus & Shop Catalogues)
-- Merchant must review and confirm extracted items before publication
CREATE TABLE IF NOT EXISTS ai_extraction_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  merchant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extraction_type VARCHAR(50) NOT NULL CHECK (extraction_type IN ('EATS_MENU', 'SHOP_CATALOGUE')),
  raw_input_summary TEXT,
  extracted_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (review_status IN ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_business ON ai_extraction_drafts(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_status ON ai_extraction_drafts(review_status);

-- 2. AI Audit and Safety Log
-- Immutable audit log for AI interactions, rate limit compliance, and prompt defense
CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50) NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  model_identifier VARCHAR(100) NOT NULL,
  tokens_prompt INT DEFAULT 0,
  tokens_completion INT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  sanitized_intent VARCHAR(100),
  flagged_injection BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_actor ON ai_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_business ON ai_audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_logs(created_at);
