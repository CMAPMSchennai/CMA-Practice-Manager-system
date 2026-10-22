-- @apply
-- @transaction single

-- 1. Drop the old CHECK constraint on entity_type (idempotent)
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS chk_audit_logs_entity_type;

-- 2. Add the new CHECK constraint with 'employees' included
ALTER TABLE IF EXISTS "audit_logs" ADD CONSTRAINT chk_audit_logs_entity_type CHECK (
  ("entity_type")::text = ANY ((ARRAY[
    'bank_accounts'::character varying,
    'clients'::character varying,
    'delay_reason_disposition'::character varying,
    'document'::character varying,
    'employees'::character varying,
    'engagement'::character varying,
    'entities'::character varying,
    'expense'::character varying,
    'invoice'::character varying,
    'invoices'::character varying,
    'payroll_readiness'::character varying,
    'payroll_readiness_thresholds'::character varying,
    'receipt'::character varying,
    'reference_data'::character varying,
    'roles'::character varying,
    'statutory_due_date'::character varying,
    'statutory_due_dates'::character varying,
    'task_instance'::character varying,
    'task_instances'::character varying,
    'task_library'::character varying,
    'user'::character varying,
    'users'::character varying
  ])::text[])
);

-- 3. Set default on id column if not already set
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- Ensure indexes still exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON "audit_logs" ("user_id");

-- @rollback
-- @transaction single

-- 1. Drop the new CHECK constraint
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS chk_audit_logs_entity_type;

-- 2. Restore the old CHECK constraint without 'employees'
ALTER TABLE IF EXISTS "audit_logs" ADD CONSTRAINT chk_audit_logs_entity_type CHECK (
  ("entity_type")::text = ANY ((ARRAY[
    'bank_accounts'::character varying,
    'clients'::character varying,
    'delay_reason_disposition'::character varying,
    'document'::character varying,
    'engagement'::character varying,
    'entities'::character varying,
    'expense'::character varying,
    'invoice'::character varying,
    'invoices'::character varying,
    'payroll_readiness'::character varying,
    'payroll_readiness_thresholds'::character varying,
    'receipt'::character varying,
    'reference_data'::character varying,
    'roles'::character varying,
    'statutory_due_date'::character varying,
    'statutory_due_dates'::character varying,
    'task_instance'::character varying,
    'task_instances'::character varying,
    'task_library'::character varying,
    'user'::character varying,
    'users'::character varying
  ])::text[])
);

-- 3. Remove default on id column (original schema had no default)
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "id" DROP DEFAULT;