-- @apply
CREATE TABLE IF NOT EXISTS "client_groups" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        VARCHAR(255) NOT NULL UNIQUE,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_client_groups_name ON "client_groups" ("name");

-- @rollback
DROP INDEX IF EXISTS ix_client_groups_name;
DROP TABLE IF EXISTS "client_groups";