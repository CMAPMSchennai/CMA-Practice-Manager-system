-- @apply
CREATE TABLE IF NOT EXISTS "statutory_due_dates" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"        UUID NOT NULL
                     REFERENCES "clients" ("id")
                     ON DELETE CASCADE ON UPDATE CASCADE,
  "rule_id"          UUID
                     REFERENCES "statutory_calendar_rules" ("id")
                     ON DELETE SET NULL ON UPDATE CASCADE,
  "obligation_name"  VARCHAR(500) NOT NULL,
  "due_date"         DATE NOT NULL,
  "period_label"     VARCHAR(50),
  "status"           VARCHAR(30) NOT NULL DEFAULT 'pending',
  "escalation_level" INTEGER NOT NULL,
  "owner_id"         UUID
                     REFERENCES "users" ("id")
                     ON DELETE SET NULL ON UPDATE CASCADE,
  "completed_at"     TIMESTAMPTZ,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_statutory_due_dates_status CHECK (status IN ('pending','in_progress','completed','overdue','not_applicable'))
);

CREATE INDEX IF NOT EXISTS idx_statutory_due_dates_client_date
  ON "statutory_due_dates" ("client_id", "due_date");

CREATE INDEX IF NOT EXISTS idx_statutory_due_dates_status
  ON "statutory_due_dates" ("status");

CREATE INDEX IF NOT EXISTS idx_statutory_due_dates_due_date
  ON "statutory_due_dates" ("due_date");

CREATE INDEX IF NOT EXISTS idx_statutory_due_dates_owner
  ON "statutory_due_dates" ("owner_id");

CREATE INDEX IF NOT EXISTS idx_statutory_due_dates_rule
  ON "statutory_due_dates" ("rule_id");

-- @rollback
DROP INDEX IF EXISTS idx_statutory_due_dates_rule;
DROP INDEX IF EXISTS idx_statutory_due_dates_owner;
DROP INDEX IF EXISTS idx_statutory_due_dates_due_date;
DROP INDEX IF EXISTS idx_statutory_due_dates_status;
DROP INDEX IF EXISTS idx_statutory_due_dates_client_date;
DROP TABLE IF EXISTS "statutory_due_dates";