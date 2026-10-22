-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "client_service_scope" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"       UUID NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "service_type_id" UUID NOT NULL REFERENCES "service_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_client_service_scope_client"
  ON "client_service_scope" ("client_id");

CREATE INDEX IF NOT EXISTS "idx_client_service_scope_service"
  ON "client_service_scope" ("service_type_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_client_service_scope_unique"
  ON "client_service_scope" ("client_id", "service_type_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_client_service_scope_unique";
DROP INDEX IF EXISTS "idx_client_service_scope_service";
DROP INDEX IF EXISTS "idx_client_service_scope_client";
DROP TABLE IF EXISTS "client_service_scope";