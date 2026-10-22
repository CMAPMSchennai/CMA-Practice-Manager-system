-- @apply
-- @transaction single

-- Add new columns for tamper-evident hash chain (FR-02)
ALTER TABLE IF EXISTS "audit_logs" ADD COLUMN IF NOT EXISTS "prev_hash" TEXT;

ALTER TABLE IF EXISTS "audit_logs" ADD COLUMN IF NOT EXISTS "row_hash" TEXT;

-- Ensure existing indexes are present (idempotent)
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON "audit_logs" ("user_id");

-- Ensure the entity_type check constraint is present (drop-then-add for idempotency)
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS chk_audit_logs_entity_type;
ALTER TABLE IF EXISTS "audit_logs" ADD CONSTRAINT chk_audit_logs_entity_type CHECK (((entity_type)::text = ANY ((ARRAY['bank_accounts'::character varying, 'clients'::character varying, 'delay_reason_disposition'::character varying, 'document'::character varying, 'engagement'::character varying, 'entities'::character varying, 'expense'::character varying, 'invoice'::character varying, 'invoices'::character varying, 'payroll_readiness'::character varying, 'payroll_readiness_thresholds'::character varying, 'receipt'::character varying, 'reference_data'::character varying, 'roles'::character varying, 'statutory_due_date'::character varying, 'statutory_due_dates'::character varying, 'task_instance'::character varying, 'task_instances'::character varying, 'task_library'::character varying, 'user'::character varying, 'users'::character varying])::text[])));

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "audit_logs" DROP COLUMN IF EXISTS "row_hash";
ALTER TABLE IF EXISTS "audit_logs" DROP COLUMN IF EXISTS "prev_hash";