-- @apply
-- @transaction single

-- Add MFA columns to users table
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "mfa_secret" TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "mfa_recovery_codes" TEXT;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "mfa_enrolled_at" TIMESTAMPTZ;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "mfa_enrolled_at";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "mfa_recovery_codes";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "mfa_secret";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "mfa_enabled";