-- @apply
CREATE TABLE IF NOT EXISTS "task_library_steps" (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_library_subtask_id"   UUID NOT NULL
                              REFERENCES "task_library_subtasks" ("id")
                              ON DELETE CASCADE ON UPDATE CASCADE,
  "step_code"                 VARCHAR(50) NOT NULL,
  "name"                      VARCHAR(500) NOT NULL,
  "description"               TEXT,
  "sort_order"                INTEGER NOT NULL,
  "override_flag"             BOOLEAN NOT NULL,
  "default_assignee_role"     VARCHAR(100),
  "estimated_hours"           NUMERIC,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_library_steps_subtask
  ON "task_library_steps" ("task_library_subtask_id");

-- @rollback
DROP INDEX IF EXISTS idx_task_library_steps_subtask;
DROP TABLE IF EXISTS "task_library_steps";