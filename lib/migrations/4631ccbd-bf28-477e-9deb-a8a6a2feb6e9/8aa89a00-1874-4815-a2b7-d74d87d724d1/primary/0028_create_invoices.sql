-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "invoices" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_number"      VARCHAR(50) NOT NULL UNIQUE,
  "billing_entity_id"   UUID NOT NULL REFERENCES "entities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "client_id"           UUID NOT NULL REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoice_date"        DATE NOT NULL,
  "due_date"            DATE,
  "line_items"          JSONB NOT NULL,
  "reimbursement_lines" JSONB,
  "subtotal"            NUMERIC NOT NULL,
  "cgst"                NUMERIC NOT NULL,
  "sgst"                NUMERIC NOT NULL,
  "igst"                NUMERIC NOT NULL,
  "total_amount"        NUMERIC(15,2) NOT NULL,
  "amount_received"     NUMERIC(15,2) NOT NULL,
  "tds_receivable"      NUMERIC,
  "status"              VARCHAR(30) NOT NULL DEFAULT 'draft',
  "issued_by"           UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "notes"               TEXT,
  "version"             INTEGER NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoices_status CHECK ("status" IN ('draft','issued','sent','partially_paid','paid','overdue','cancelled','written_off'))
);

CREATE INDEX IF NOT EXISTS "idx_invoices_number"         ON "invoices" USING btree ("invoice_number");
CREATE INDEX IF NOT EXISTS "idx_invoices_billing_entity" ON "invoices" USING btree ("billing_entity_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_client"         ON "invoices" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_status"         ON "invoices" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_invoices_date"           ON "invoices" USING btree ("invoice_date");
CREATE INDEX IF NOT EXISTS "idx_invoices_due_date"       ON "invoices" USING btree ("due_date");
CREATE INDEX IF NOT EXISTS "idx_invoices_issued_by"      ON "invoices" USING btree ("issued_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_invoices_issued_by";
DROP INDEX IF EXISTS "idx_invoices_due_date";
DROP INDEX IF EXISTS "idx_invoices_date";
DROP INDEX IF EXISTS "idx_invoices_status";
DROP INDEX IF EXISTS "idx_invoices_client";
DROP INDEX IF EXISTS "idx_invoices_billing_entity";
DROP INDEX IF EXISTS "idx_invoices_number";
DROP TABLE IF EXISTS "invoices";