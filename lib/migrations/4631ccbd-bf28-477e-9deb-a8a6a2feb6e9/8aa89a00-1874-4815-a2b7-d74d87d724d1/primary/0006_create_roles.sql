-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "roles" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        VARCHAR(100) NOT NULL UNIQUE,
  "description" TEXT,
  "permissions" JSONB NOT NULL,
  "is_seeded"   BOOLEAN NOT NULL DEFAULT false,
  "is_custom"   BOOLEAN NOT NULL DEFAULT false,
  "cloned_from" UUID REFERENCES "roles" ("id") ON DELETE SET NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_roles_name ON "roles" ("name");

CREATE INDEX IF NOT EXISTS ix_roles_cloned_from ON "roles" ("cloned_from");

CREATE INDEX IF NOT EXISTS idx_roles_permissions_gin ON "roles" USING gin ("permissions");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_roles_permissions_gin;
DROP INDEX IF EXISTS ix_roles_cloned_from;
DROP INDEX IF EXISTS ix_roles_name;
DROP TABLE IF EXISTS "roles";