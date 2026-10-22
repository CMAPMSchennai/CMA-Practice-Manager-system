-- @apply
-- @transaction single

-- Add new columns
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "created_by";