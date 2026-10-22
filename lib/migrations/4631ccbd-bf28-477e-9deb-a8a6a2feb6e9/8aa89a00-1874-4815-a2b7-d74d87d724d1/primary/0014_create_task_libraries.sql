-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "task_libraries" (
  "id"                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name"                VARCHAR(500) NOT NULL,
  "description"         TEXT,
  "version"             INTEGER     NOT NULL DEFAULT 0,
  "parent_template_id"  UUID,
  "is_active"           BOOLEAN     NOT NULL DEFAULT true,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_task_libraries_parent_template
    FOREIGN KEY ("parent_template_id")
    REFERENCES "task_libraries" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_libraries_parent_template
  ON "task_libraries" ("parent_template_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_task_libraries_parent_template;
DROP TABLE IF EXISTS "task_libraries";