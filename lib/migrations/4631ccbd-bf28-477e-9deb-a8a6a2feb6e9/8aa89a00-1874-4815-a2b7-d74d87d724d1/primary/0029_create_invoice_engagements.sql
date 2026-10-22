-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "invoice_engagements" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id"    UUID NOT NULL REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "engagement_id" UUID NOT NULL REFERENCES "engagements" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount"        NUMERIC(15,2),
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_invoice_engagements_invoice"
  ON "invoice_engagements" ("invoice_id");

CREATE INDEX IF NOT EXISTS "idx_invoice_engagements_engagement"
  ON "invoice_engagements" ("engagement_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_invoice_engagements_unique"
  ON "invoice_engagements" ("invoice_id", "engagement_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_invoice_engagements_unique";
DROP INDEX IF EXISTS "idx_invoice_engagements_engagement";
DROP INDEX IF EXISTS "idx_invoice_engagements_invoice";
DROP TABLE IF EXISTS "invoice_engagements";