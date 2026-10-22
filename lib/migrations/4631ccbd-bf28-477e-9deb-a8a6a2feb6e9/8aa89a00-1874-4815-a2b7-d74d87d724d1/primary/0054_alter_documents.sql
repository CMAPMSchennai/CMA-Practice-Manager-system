-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "documents"
  ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

ALTER TABLE IF EXISTS "documents"
  ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

CREATE INDEX IF NOT EXISTS ix_documents_created_by ON "documents" ("created_by");
CREATE INDEX IF NOT EXISTS ix_documents_updated_by ON "documents" ("updated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_documents_updated_by;
DROP INDEX IF EXISTS ix_documents_created_by;

ALTER TABLE IF EXISTS "documents"
  DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "documents"
  DROP COLUMN IF EXISTS "created_by";