-- @apply
-- @transaction single

-- Add new columns
ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "temp_password_expires_at" TIMESTAMPTZ;

ALTER TABLE IF EXISTS "users"
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMPTZ;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "users"
  DROP COLUMN IF EXISTS "password_changed_at";

ALTER TABLE IF EXISTS "users"
  DROP COLUMN IF EXISTS "temp_password_expires_at";

ALTER TABLE IF EXISTS "users"
  DROP COLUMN IF EXISTS "must_change_password";