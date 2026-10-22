-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_id"       UUID NOT NULL REFERENCES "entities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "bank_name"       VARCHAR(255) NOT NULL,
  "account_number"  TEXT NOT NULL,
  "ifsc_code"       VARCHAR(11),
  "account_type"    VARCHAR(50) NOT NULL,
  "opening_balance" NUMERIC(15,2),
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_bank_accounts_account_type CHECK (account_type IN ('current','savings','overdraft'))
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_entity ON "bank_accounts" ("entity_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_bank_accounts_entity;
DROP TABLE IF EXISTS "bank_accounts";