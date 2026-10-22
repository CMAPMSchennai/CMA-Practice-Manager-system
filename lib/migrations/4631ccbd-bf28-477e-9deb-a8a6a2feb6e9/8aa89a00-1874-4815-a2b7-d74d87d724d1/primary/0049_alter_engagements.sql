-- @apply
-- @transaction single

-- Add created_by column
ALTER TABLE IF EXISTS "engagements" ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

-- Add updated_by column
ALTER TABLE IF EXISTS "engagements" ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "engagements" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE IF EXISTS "engagements" DROP COLUMN IF EXISTS "created_by";