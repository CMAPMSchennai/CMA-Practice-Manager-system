-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "client_groups" ADD COLUMN IF NOT EXISTS "created_by" UUID;

ALTER TABLE IF EXISTS "client_groups" ADD COLUMN IF NOT EXISTS "updated_by" UUID;

CREATE INDEX IF NOT EXISTS ix_client_groups_created_by ON "client_groups" ("created_by");

CREATE INDEX IF NOT EXISTS ix_client_groups_updated_by ON "client_groups" ("updated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_client_groups_updated_by;

DROP INDEX IF EXISTS ix_client_groups_created_by;

ALTER TABLE IF EXISTS "client_groups" DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "client_groups" DROP COLUMN IF EXISTS "created_by";