-- @apply
CREATE TABLE IF NOT EXISTS "task_library_subtasks" (
  "id"                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_library_area_id"  UUID        NOT NULL
                            REFERENCES "task_library_areas" ("id")
                            ON DELETE CASCADE ON UPDATE CASCADE,
  "name"                  VARCHAR(500) NOT NULL,
  "sort_order"            INTEGER     NOT NULL,
  "description"           TEXT,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_library_subtasks_area
  ON "task_library_subtasks" ("task_library_area_id");

-- @rollback
DROP INDEX IF EXISTS idx_task_library_subtasks_area;
DROP TABLE IF EXISTS "task_library_subtasks";