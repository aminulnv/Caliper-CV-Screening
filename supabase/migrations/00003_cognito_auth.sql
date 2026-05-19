-- Migration: replace Supabase auth.users with Cognito user store
-- Run this after 00002_caliper_core.sql

-- Users table — keyed by Cognito sub (UUID string)
CREATE TABLE IF NOT EXISTS users (
  sub         TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Drop Supabase-specific FK on user_roles and audit_log, change to text
ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey,
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Add FK to our new users table
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (sub) REFERENCES users(sub);

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(sub);

-- Unique constraint so duplicate provisioning is safe
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_user_workspace_unique UNIQUE (user_id, workspace_id);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
