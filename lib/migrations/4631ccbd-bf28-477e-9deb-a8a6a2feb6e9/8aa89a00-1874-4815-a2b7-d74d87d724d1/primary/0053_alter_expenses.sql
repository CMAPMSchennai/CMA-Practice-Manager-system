-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "expenses"
  ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

ALTER TABLE IF EXISTS "expenses"
  ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

CREATE INDEX IF NOT EXISTS ix_expenses_created_by ON "expenses" ("created_by");

CREATE INDEX IF NOT EXISTS ix_expenses_updated_by ON "expenses" ("updated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_expenses_updated_by;

DROP INDEX IF EXISTS ix_expenses_created_by;

ALTER TABLE IF EXISTS "expenses"
  DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "expenses"
  DROP COLUMN IF EXISTS "created_by";