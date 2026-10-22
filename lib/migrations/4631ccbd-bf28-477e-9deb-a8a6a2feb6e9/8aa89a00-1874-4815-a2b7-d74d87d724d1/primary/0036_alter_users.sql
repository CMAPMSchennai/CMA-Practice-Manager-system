-- @apply
-- @transaction single

-- Add columns for NextAuth user profile fields
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "name" TEXT;

ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "email" TEXT;

ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "image" TEXT;

ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "role" TEXT;

-- Add unique constraint on email
-- Drop first to make idempotent, then re-add
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS "uq_users_email";
ALTER TABLE IF EXISTS "users" ADD CONSTRAINT "uq_users_email" UNIQUE ("email");

-- Create index IF NOT EXISTS on email for lookups
CREATE INDEX IF NOT EXISTS "ix_users_email" ON "users" ("email");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "ix_users_email";

ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS "uq_users_email";

ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "role";

ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "image";

ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "email";

ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "name";