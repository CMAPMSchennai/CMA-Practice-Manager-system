-- @apply
-- @transaction single

-- Add new column: planned_start_date
ALTER TABLE IF EXISTS "task_instances"
  ADD COLUMN IF NOT EXISTS "planned_start_date" DATE NULL;

-- @rollback
-- @transaction single

-- Remove added column: planned_start_date
ALTER TABLE IF EXISTS "task_instances"
  DROP COLUMN IF EXISTS "planned_start_date";