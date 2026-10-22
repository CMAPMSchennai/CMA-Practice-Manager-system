-- @apply
-- @transaction single

ALTER TABLE IF EXISTS "invoices"
  ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;

ALTER TABLE IF EXISTS "invoices"
  ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_created_by ON "invoices" ("created_by");
CREATE INDEX IF NOT EXISTS ix_invoices_updated_by ON "invoices" ("updated_by");

-- Re-apply the status CHECK constraint idempotently
ALTER TABLE IF EXISTS "invoices" DROP CONSTRAINT IF EXISTS chk_invoices_status;
ALTER TABLE IF EXISTS "invoices" ADD CONSTRAINT chk_invoices_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'issued'::character varying, 'sent'::character varying, 'partially_paid'::character varying, 'paid'::character varying, 'overdue'::character varying, 'cancelled'::character varying, 'written_off'::character varying])::text[])));

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS ix_invoices_updated_by;
DROP INDEX IF EXISTS ix_invoices_created_by;

ALTER TABLE IF EXISTS "invoices"
  DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE IF EXISTS "invoices"
  DROP COLUMN IF EXISTS "created_by";