-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "entities" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name"       VARCHAR(255) NOT NULL UNIQUE,
  "short_code" VARCHAR(20) NOT NULL UNIQUE,
  "pan"        TEXT,
  "gstin"      VARCHAR(15),
  "address"    TEXT,
  "can_attest" BOOLEAN NOT NULL DEFAULT false,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "metadata"   JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_entities_short_code CHECK (short_code IN ('CMA','SGC','GMC'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_short_code ON "entities" USING btree ("short_code");

CREATE INDEX IF NOT EXISTS ix_entities_is_active ON "entities" ("is_active");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_entities_is_active;
DROP INDEX IF EXISTS idx_entities_short_code;
DROP TABLE IF EXISTS "entities";