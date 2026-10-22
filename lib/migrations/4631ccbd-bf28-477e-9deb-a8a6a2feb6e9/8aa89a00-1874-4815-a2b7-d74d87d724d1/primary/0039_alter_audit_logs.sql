-- @apply
-- @transaction single

-- Add created_at column
ALTER TABLE IF EXISTS "audit_logs"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add updated_at column
ALTER TABLE IF EXISTS "audit_logs"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Update CHECK constraint on entity_type: drop old, add new with all entity types
ALTER TABLE IF EXISTS "audit_logs"
  DROP CONSTRAINT IF EXISTS chk_audit_logs_entity_type;

ALTER TABLE IF EXISTS "audit_logs"
  ADD CONSTRAINT chk_audit_logs_entity_type CHECK (
    entity_type IN (
      'bank_accounts',
      'clients',
      'delay_reason_disposition',
      'document',
      'engagement',
      'entities',
      'expense',
      'invoice',
      'invoices',
      'payroll_readiness',
      'payroll_readiness_thresholds',
      'receipt',
      'reference_data',
      'roles',
      'statutory_due_date',
      'statutory_due_dates',
      'task_instance',
      'task_instances',
      'task_library',
      'user',
      'users'
    )
  );

-- Ensure CHECK constraint on action is present (idempotent re-create)
ALTER TABLE IF EXISTS "audit_logs"
  DROP CONSTRAINT IF EXISTS chk_audit_logs_action;

ALTER TABLE IF EXISTS "audit_logs"
  ADD CONSTRAINT chk_audit_logs_action CHECK (
    action IN (
      'create',
      'update',
      'delete',
      'status_change',
      'login',
      'logout',
      'permission_change',
      'salary_release',
      'override'
    )
  );

-- Ensure indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "audit_logs" ("action");

-- @rollback
-- @transaction single

-- Restore original CHECK constraint on entity_type (narrow list)
ALTER TABLE IF EXISTS "audit_logs"
  DROP CONSTRAINT IF EXISTS chk_audit_logs_entity_type;

ALTER TABLE IF EXISTS "audit_logs"
  ADD CONSTRAINT chk_audit_logs_entity_type CHECK (
    entity_type IN ('clients', 'task_instances', 'invoices')
  );

-- Keep action constraint as it was (same values, just re-ensure the name)
ALTER TABLE IF EXISTS "audit_logs"
  DROP CONSTRAINT IF EXISTS chk_audit_logs_action;

ALTER TABLE IF EXISTS "audit_logs"
  ADD CONSTRAINT chk_audit_logs_action CHECK (
    action IN (
      'create',
      'update',
      'delete',
      'status_change',
      'login',
      'logout',
      'permission_change',
      'salary_release',
      'override'
    )
  );

-- Remove added columns
ALTER TABLE IF EXISTS "audit_logs"
  DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE IF EXISTS "audit_logs"
  DROP COLUMN IF EXISTS "created_at";