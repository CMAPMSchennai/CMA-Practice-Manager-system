-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "service_types" (
  "id"                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"                      VARCHAR(50) NOT NULL UNIQUE,
  "name"                      VARCHAR(500) NOT NULL,
  "description"               TEXT,
  "parent_service_id"         UUID,
  "is_attest"                 BOOLEAN     NOT NULL DEFAULT false,
  "is_recurring"              BOOLEAN     NOT NULL DEFAULT false,
  "recurrence_pattern"        VARCHAR(50),
  "default_billing_entity_id" UUID,
  "linked_task_library_id"    UUID,
  "standard_fee"              NUMERIC(15,2),
  "sac_code"                  VARCHAR(20),
  "is_active"                 BOOLEAN     NOT NULL DEFAULT true,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "chk_service_types_recurrence_pattern"
    CHECK ("recurrence_pattern" IN ('monthly','quarterly','half_yearly','annually')),

  CONSTRAINT "fk_service_types_parent_service_id"
    FOREIGN KEY ("parent_service_id")
    REFERENCES "service_types" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT "fk_service_types_default_billing_entity_id"
    FOREIGN KEY ("default_billing_entity_id")
    REFERENCES "entities" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT "fk_service_types_linked_task_library_id"
    FOREIGN KEY ("linked_task_library_id")
    REFERENCES "task_libraries" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_types_code"
  ON "service_types" ("code");

CREATE INDEX IF NOT EXISTS "idx_service_types_parent"
  ON "service_types" ("parent_service_id");

CREATE INDEX IF NOT EXISTS "idx_service_types_billing_entity"
  ON "service_types" ("default_billing_entity_id");

CREATE INDEX IF NOT EXISTS "idx_service_types_library"
  ON "service_types" ("linked_task_library_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_service_types_library";
DROP INDEX IF EXISTS "idx_service_types_billing_entity";
DROP INDEX IF EXISTS "idx_service_types_parent";
DROP INDEX IF EXISTS "idx_service_types_code";
DROP TABLE IF EXISTS "service_types";