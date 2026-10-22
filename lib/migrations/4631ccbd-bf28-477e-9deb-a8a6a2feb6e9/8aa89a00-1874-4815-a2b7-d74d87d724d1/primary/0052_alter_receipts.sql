-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "receipts"
  ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

ALTER TABLE IF EXISTS "receipts"
  ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

CREATE INDEX IF NOT EXISTS ix_receipts_created_by ON "receipts" ("created_by");
CREATE INDEX IF NOT EXISTS ix_receipts_updated_by ON "receipts" ("updated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_receipts_updated_by;
DROP INDEX IF EXISTS ix_receipts_created_by;

ALTER TABLE IF EXISTS "receipts"
  DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "receipts"
  DROP COLUMN IF EXISTS "created_by";