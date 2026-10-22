-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "expenses" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "entity_id"             UUID        NOT NULL,
  "expense_date"          DATE        NOT NULL,
  "category"              VARCHAR(100) NOT NULL,
  "description"           TEXT,
  "amount"                NUMERIC(15,2) NOT NULL,
  "gst_amount"            NUMERIC(15,2),
  "paid_from_account"     UUID,
  "linked_engagement_id"  UUID,
  "vendor_name"           VARCHAR(255),
  "payment_reference"     VARCHAR(255),
  "recorded_by"           UUID        NOT NULL,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_expenses_entity_id
    FOREIGN KEY ("entity_id")
    REFERENCES "entities" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_expenses_paid_from_account
    FOREIGN KEY ("paid_from_account")
    REFERENCES "bank_accounts" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_expenses_linked_engagement_id
    FOREIGN KEY ("linked_engagement_id")
    REFERENCES "engagements" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_expenses_recorded_by
    FOREIGN KEY ("recorded_by")
    REFERENCES "users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expenses_entity
  ON "expenses" USING btree ("entity_id");

CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON "expenses" USING btree ("expense_date");

CREATE INDEX IF NOT EXISTS idx_expenses_engagement
  ON "expenses" USING btree ("linked_engagement_id");

CREATE INDEX IF NOT EXISTS idx_expenses_paid_from
  ON "expenses" USING btree ("paid_from_account");

CREATE INDEX IF NOT EXISTS idx_expenses_category
  ON "expenses" USING btree ("category");

CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by
  ON "expenses" USING btree ("recorded_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_expenses_recorded_by;
DROP INDEX IF EXISTS idx_expenses_category;
DROP INDEX IF EXISTS idx_expenses_paid_from;
DROP INDEX IF EXISTS idx_expenses_engagement;
DROP INDEX IF EXISTS idx_expenses_date;
DROP INDEX IF EXISTS idx_expenses_entity;
DROP TABLE IF EXISTS "expenses";