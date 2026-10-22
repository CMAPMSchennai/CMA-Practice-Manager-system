-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "task_instances" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  "engagement_id"         UUID        NOT NULL,
  "library_step_ref"      UUID,
  "library_area_name"     VARCHAR(500),
  "library_subtask_name"  VARCHAR(500),
  "step_code"             VARCHAR(50),
  "title"                 VARCHAR(500) NOT NULL,
  "description"           TEXT,
  "assigned_to"           UUID,
  "reviewer"              UUID,
  "status"                VARCHAR(30) NOT NULL DEFAULT 'not_started',
  "priority"              VARCHAR(20),
  "due_date"              DATE,
  "completed_at"          TIMESTAMPTZ,
  "observations"          TEXT,
  "working_paper_refs"    JSONB,
  "actual_hours"          NUMERIC,
  "sort_order"            INTEGER,
  "version"               INTEGER     NOT NULL DEFAULT 0,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_task_instances PRIMARY KEY ("id"),

  CONSTRAINT chk_task_instances_status
    CHECK ("status" IN ('not_started','in_progress','under_review','completed','returned','blocked','not_applicable')),

  CONSTRAINT chk_task_instances_priority
    CHECK ("priority" IN ('low','medium','high','critical')),

  CONSTRAINT fk_task_instances_engagement
    FOREIGN KEY ("engagement_id")
    REFERENCES "engagements" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_task_instances_library_step_ref
    FOREIGN KEY ("library_step_ref")
    REFERENCES "task_library_steps" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_task_instances_assigned_to
    FOREIGN KEY ("assigned_to")
    REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_task_instances_reviewer
    FOREIGN KEY ("reviewer")
    REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_task_instances_engagement"
  ON "task_instances" ("engagement_id");

CREATE INDEX IF NOT EXISTS "idx_task_instances_assigned"
  ON "task_instances" ("assigned_to");

CREATE INDEX IF NOT EXISTS "idx_task_instances_reviewer"
  ON "task_instances" ("reviewer");

CREATE INDEX IF NOT EXISTS "idx_task_instances_status"
  ON "task_instances" ("status");

CREATE INDEX IF NOT EXISTS "idx_task_instances_due_date"
  ON "task_instances" ("due_date");

CREATE INDEX IF NOT EXISTS "idx_task_instances_library_step"
  ON "task_instances" ("library_step_ref");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_task_instances_library_step";
DROP INDEX IF EXISTS "idx_task_instances_due_date";
DROP INDEX IF EXISTS "idx_task_instances_status";
DROP INDEX IF EXISTS "idx_task_instances_reviewer";
DROP INDEX IF EXISTS "idx_task_instances_assigned";
DROP INDEX IF EXISTS "idx_task_instances_engagement";
DROP TABLE IF EXISTS "task_instances";