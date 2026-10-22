-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "task_instances"
  ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

ALTER TABLE IF EXISTS "task_instances"
  ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "task_instances"
  DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "task_instances"
  DROP COLUMN IF EXISTS "created_by";