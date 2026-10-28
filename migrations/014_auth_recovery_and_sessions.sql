-- ====================================================================
-- TUXI ENTERPRISE DATABASE SCHEMA MIGRATION 002
-- Authentication Recovery, Server-Authoritative Sessions & Rate Limiting
-- Phase AUTH-1B.1 Schema Architecture (PostgreSQL 15+ Compatible)
-- ====================================================================

-- 1. USER SESSIONS (Server-Authoritative Session Management)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(100),
    CONSTRAINT chk_user_sessions_token_hash_len CHECK (length(token_hash) = 64),
    CONSTRAINT chk_user_sessions_expires_valid CHECK (expires_at > created_at),
    CONSTRAINT chk_user_sessions_revoked_valid CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

-- Partial index for active (unrevoked) sessions per user
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- Expiration index for automated session cleanup and TTL evaluation
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);


-- 2. PASSWORD RESET TOKENS (Strict 15-Minute Expiry, Single-Use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT chk_password_reset_token_hash_len CHECK (length(token_hash) = 64),
    CONSTRAINT chk_password_reset_15m_lifetime CHECK (expires_at = created_at + INTERVAL '15 minutes'),
    CONSTRAINT chk_password_reset_used_valid CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Partial index for active (unused) password reset tokens per user
CREATE INDEX IF NOT EXISTS idx_password_reset_user_active ON password_reset_tokens (user_id) WHERE used_at IS NULL;

-- Expiration index for token lifecycle cleanup
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON password_reset_tokens (expires_at);


-- 3. EMAIL VERIFICATION TOKENS (Mandatory Before Checkout)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    target_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT chk_email_verification_token_hash_len CHECK (length(token_hash) = 64),
    CONSTRAINT chk_email_verification_target_email_format CHECK (target_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_email_verification_expires_valid CHECK (expires_at > created_at),
    CONSTRAINT chk_email_verification_used_valid CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Partial index for active (unused) verification tokens per user
CREATE INDEX IF NOT EXISTS idx_email_verification_user_active ON email_verification_tokens (user_id) WHERE used_at IS NULL;

-- Expiration index for token cleanup
CREATE INDEX IF NOT EXISTS idx_email_verification_expires_at ON email_verification_tokens (expires_at);


-- 4. RATE LIMITS (Distributed Atomic Rate Limiting & Lockout)
CREATE TABLE IF NOT EXISTS rate_limits (
    rate_key VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_expires_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ,
    CONSTRAINT pk_rate_limits PRIMARY KEY (action, rate_key),
    CONSTRAINT chk_rate_limits_attempt_count CHECK (attempt_count >= 1),
    CONSTRAINT chk_rate_limits_window_valid CHECK (window_expires_at >= first_attempt_at),
    CONSTRAINT chk_rate_limits_last_attempt_valid CHECK (last_attempt_at >= first_attempt_at),
    CONSTRAINT chk_rate_limits_locked_valid CHECK (locked_until IS NULL OR locked_until >= first_attempt_at)
);

-- Compound index for rapid expiration and lockout evaluation and cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits (window_expires_at, locked_until);
