-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "statutory_calendar_rules" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                        VARCHAR(500) NOT NULL,
  "statute"                     VARCHAR(255),
  "form_or_return"              VARCHAR(100),
  "applicable_entity_types"     JSONB,
  "applicable_service_type_id"  UUID,
  "frequency"                   VARCHAR(30) NOT NULL,
  "due_day_of_month"            INTEGER,
  "due_date_logic"              JSONB,
  "escalation_rules"            JSONB,
  "is_active"                   BOOLEAN NOT NULL DEFAULT true,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_statutory_calendar_rules_frequency
    CHECK (frequency IN ('monthly','quarterly','half_yearly','annually','one_time','event_driven')),

  CONSTRAINT fk_statutory_calendar_rules_service_type
    FOREIGN KEY ("applicable_service_type_id")
    REFERENCES "service_types" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statutory_rules_service
  ON "statutory_calendar_rules" ("applicable_service_type_id");

CREATE INDEX IF NOT EXISTS idx_statutory_rules_frequency
  ON "statutory_calendar_rules" ("frequency");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_statutory_rules_frequency;
DROP INDEX IF EXISTS idx_statutory_rules_service;
DROP TABLE IF EXISTS "statutory_calendar_rules";