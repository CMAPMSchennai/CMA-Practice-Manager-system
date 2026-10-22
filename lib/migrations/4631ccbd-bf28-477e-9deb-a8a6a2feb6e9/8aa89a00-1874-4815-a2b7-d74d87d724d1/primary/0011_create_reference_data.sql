-- @apply
CREATE TABLE IF NOT EXISTS "reference_data" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"       VARCHAR(100) NOT NULL,
  "code"       VARCHAR(100) NOT NULL,
  "label"      VARCHAR(255) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "metadata"   JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_reference_data_type CHECK ("type" IN ('entity_type','delay_reason','payment_mode','position_type'))
);

CREATE INDEX IF NOT EXISTS idx_reference_data_type ON "reference_data" ("type");

CREATE UNIQUE INDEX IF NOT EXISTS idx_reference_data_type_code ON "reference_data" ("type", "code");

-- @rollback
DROP INDEX IF EXISTS idx_reference_data_type_code;
DROP INDEX IF EXISTS idx_reference_data_type;
DROP TABLE IF EXISTS "reference_data";