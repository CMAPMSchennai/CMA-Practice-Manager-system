-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "payroll_readiness" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_id"          UUID         NOT NULL,
  "payroll_entity_id"    UUID         NOT NULL,
  "period"               DATE         NOT NULL,
  "task_completion_pct"  NUMERIC(5,4),
  "open_blocking_items"  INTEGER      NOT NULL,
  "salary_status"        VARCHAR(30)  NOT NULL DEFAULT 'ready',
  "released_by"          UUID,
  "released_at"          TIMESTAMPTZ,
  "notes"                TEXT,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_payroll_readiness_salary_status
    CHECK (salary_status IN ('ready','review_needed','on_hold','released')),

  CONSTRAINT fk_payroll_readiness_employee
    FOREIGN KEY ("employee_id") REFERENCES "employees" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_payroll_readiness_payroll_entity
    FOREIGN KEY ("payroll_entity_id") REFERENCES "entities" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_payroll_readiness_released_by
    FOREIGN KEY ("released_by") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_payroll_readiness_emp_period"
  ON "payroll_readiness" ("employee_id", "period");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_payroll_readiness_unique"
  ON "payroll_readiness" ("employee_id", "payroll_entity_id", "period");

CREATE INDEX IF NOT EXISTS "idx_payroll_readiness_entity"
  ON "payroll_readiness" ("payroll_entity_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_readiness_status"
  ON "payroll_readiness" ("salary_status");

CREATE INDEX IF NOT EXISTS "idx_payroll_readiness_released_by"
  ON "payroll_readiness" ("released_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_payroll_readiness_released_by";
DROP INDEX IF EXISTS "idx_payroll_readiness_status";
DROP INDEX IF EXISTS "idx_payroll_readiness_entity";
DROP INDEX IF EXISTS "idx_payroll_readiness_unique";
DROP INDEX IF EXISTS "idx_payroll_readiness_emp_period";
DROP TABLE IF EXISTS "payroll_readiness";