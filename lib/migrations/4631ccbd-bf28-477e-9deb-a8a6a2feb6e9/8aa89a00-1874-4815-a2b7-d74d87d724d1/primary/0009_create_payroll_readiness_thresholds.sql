-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "payroll_readiness_thresholds" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"                UUID NOT NULL UNIQUE
                             REFERENCES "entities" ("id")
                             ON DELETE CASCADE ON UPDATE CASCADE,
  "min_task_completion_pct"  NUMERIC(5,4) NOT NULL,
  "allow_partial_release"    BOOLEAN NOT NULL DEFAULT false,
  "config"                   JSONB,
  "updated_by"               UUID
                             REFERENCES "users" ("id")
                             ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_payroll_thresholds_entity"
  ON "payroll_readiness_thresholds" USING btree ("entity_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_readiness_thresholds_updated_by"
  ON "payroll_readiness_thresholds" USING btree ("updated_by");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_readiness_thresholds_entity_id_updated_by"
  ON "payroll_readiness_thresholds" USING btree ("entity_id", "updated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "uq_payroll_readiness_thresholds_entity_id_updated_by";
DROP INDEX IF EXISTS "idx_payroll_readiness_thresholds_updated_by";
DROP INDEX IF EXISTS "idx_payroll_thresholds_entity";
DROP TABLE IF EXISTS "payroll_readiness_thresholds";