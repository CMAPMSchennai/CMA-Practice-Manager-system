-- @apply
-- @transaction single

-- Add "created_at" column if it does not exist
ALTER TABLE IF EXISTS "entities" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add "updated_at" column if it does not exist
ALTER TABLE IF EXISTS "entities" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop the CHECK constraint on short_code that limited values to ('CMA','SGC','GMC')
ALTER TABLE IF EXISTS "entities" DROP CONSTRAINT IF EXISTS "chk_entities_short_code";

-- Add index on is_active
CREATE INDEX IF NOT EXISTS "ix_entities_is_active" ON "entities" ("is_active");

-- @rollback
-- @transaction single

-- Drop the is_active index
DROP INDEX IF EXISTS "ix_entities_is_active";

-- Re-add the CHECK constraint on short_code
ALTER TABLE IF EXISTS "entities" DROP CONSTRAINT IF EXISTS "chk_entities_short_code";
ALTER TABLE IF EXISTS "entities" ADD CONSTRAINT "chk_entities_short_code" CHECK ("short_code" IN ('CMA','SGC','GMC'));

-- Drop the added columns
ALTER TABLE IF EXISTS "entities" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE IF EXISTS "entities" DROP COLUMN IF EXISTS "created_at";