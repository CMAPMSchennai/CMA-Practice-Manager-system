-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "receipts" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id"        UUID NOT NULL REFERENCES "invoices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "client_id"         UUID NOT NULL REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "receipt_date"      DATE NOT NULL,
  "amount"            NUMERIC(15, 2) NOT NULL,
  "tds_amount"        NUMERIC(15, 2),
  "payment_mode"      VARCHAR(50),
  "payment_reference" VARCHAR(255),
  "bank_account_id"   UUID REFERENCES "bank_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "recorded_by"       UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "notes"             TEXT,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_receipts_invoice" ON "receipts" USING btree ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_receipts_client" ON "receipts" USING btree ("client_id");
CREATE INDEX IF NOT EXISTS "idx_receipts_date" ON "receipts" USING btree ("receipt_date");
CREATE INDEX IF NOT EXISTS "idx_receipts_bank" ON "receipts" USING btree ("bank_account_id");
CREATE INDEX IF NOT EXISTS "idx_receipts_recorded_by" ON "receipts" USING btree ("recorded_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_receipts_recorded_by";
DROP INDEX IF EXISTS "idx_receipts_bank";
DROP INDEX IF EXISTS "idx_receipts_date";
DROP INDEX IF EXISTS "idx_receipts_client";
DROP INDEX IF EXISTS "idx_receipts_invoice";
DROP TABLE IF EXISTS "receipts";