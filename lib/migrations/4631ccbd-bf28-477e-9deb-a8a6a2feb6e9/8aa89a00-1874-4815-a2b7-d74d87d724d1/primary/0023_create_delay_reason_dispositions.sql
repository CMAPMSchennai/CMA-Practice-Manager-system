-- @apply
CREATE TABLE IF NOT EXISTS "delay_reason_dispositions" (
  "id"                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "task_instance_id"    UUID        NOT NULL
                        REFERENCES "task_instances" ("id")
                        ON DELETE CASCADE ON UPDATE CASCADE,
  "reason_id"           UUID        NOT NULL
                        REFERENCES "reference_data" ("id")
                        ON DELETE RESTRICT ON UPDATE CASCADE,
  "free_text"           TEXT,
  "logged_by"           UUID        NOT NULL
                        REFERENCES "users" ("id")
                        ON DELETE RESTRICT ON UPDATE CASCADE,
  "logged_at"           TIMESTAMPTZ NOT NULL,
  "disposition_action"  VARCHAR(30),
  "disposition_notes"   TEXT,
  "dispositioned_by"    UUID
                        REFERENCES "users" ("id")
                        ON DELETE SET NULL ON UPDATE CASCADE,
  "dispositioned_at"    TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_delay_reason_dispositions_disposition_action
    CHECK (disposition_action IN ('accept','counsel','reassign','escalate','approve_handover'))
);

CREATE INDEX IF NOT EXISTS "idx_delay_dispositions_task"
  ON "delay_reason_dispositions" ("task_instance_id");

CREATE INDEX IF NOT EXISTS "idx_delay_dispositions_reason"
  ON "delay_reason_dispositions" ("reason_id");

CREATE INDEX IF NOT EXISTS "idx_delay_dispositions_logged_by"
  ON "delay_reason_dispositions" ("logged_by");

CREATE INDEX IF NOT EXISTS "idx_delay_reason_dispositions_dispositioned_by"
  ON "delay_reason_dispositions" ("dispositioned_by");

-- @rollback
DROP INDEX IF EXISTS "idx_delay_reason_dispositions_dispositioned_by";
DROP INDEX IF EXISTS "idx_delay_dispositions_logged_by";
DROP INDEX IF EXISTS "idx_delay_dispositions_reason";
DROP INDEX IF EXISTS "idx_delay_dispositions_task";
DROP TABLE IF EXISTS "delay_reason_dispositions";