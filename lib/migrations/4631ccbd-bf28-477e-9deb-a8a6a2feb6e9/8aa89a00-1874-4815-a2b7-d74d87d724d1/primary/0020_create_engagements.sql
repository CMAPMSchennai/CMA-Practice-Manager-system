-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "engagements" (
  "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "engagement_code"           VARCHAR(50)  NOT NULL,
  "client_id"                 UUID         NOT NULL,
  "service_type_id"           UUID         NOT NULL,
  "billing_entity_id"         UUID         NOT NULL,
  "task_library_id"           UUID,
  "task_library_version_used" INTEGER,
  "period_start"              DATE,
  "period_end"                DATE,
  "fee_basis"                 VARCHAR(50),
  "agreed_fee"                NUMERIC(15,2),
  "reimbursement_heads"       JSONB,
  "progress_pct"              NUMERIC(5,4),
  "status"                    VARCHAR(30)  NOT NULL DEFAULT 'draft',
  "partner_in_charge_id"      UUID,
  "is_recurring"              BOOLEAN      NOT NULL DEFAULT false,
  "parent_engagement_id"      UUID,
  "version"                   INTEGER      NOT NULL DEFAULT 0,
  "notes"                     TEXT,
  "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "pk_engagements" PRIMARY KEY ("id"),
  CONSTRAINT "uq_engagements_engagement_code" UNIQUE ("engagement_code"),

  CONSTRAINT "chk_engagements_fee_basis"
    CHECK ("fee_basis" IN ('fixed','hourly','retainer','value_based')),

  CONSTRAINT "chk_engagements_status"
    CHECK ("status" IN ('draft','active','in_progress','completed','cancelled','on_hold')),

  CONSTRAINT "fk_engagements_client"
    FOREIGN KEY ("client_id")
    REFERENCES "clients" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "fk_engagements_service_type"
    FOREIGN KEY ("service_type_id")
    REFERENCES "service_types" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "fk_engagements_billing_entity"
    FOREIGN KEY ("billing_entity_id")
    REFERENCES "entities" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "fk_engagements_task_library"
    FOREIGN KEY ("task_library_id")
    REFERENCES "task_libraries" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "fk_engagements_partner_in_charge"
    FOREIGN KEY ("partner_in_charge_id")
    REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "fk_engagements_parent_engagement"
    FOREIGN KEY ("parent_engagement_id")
    REFERENCES "engagements" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_engagements_code"
  ON "engagements" USING btree ("engagement_code");

CREATE INDEX IF NOT EXISTS "idx_engagements_client"
  ON "engagements" USING btree ("client_id");

CREATE INDEX IF NOT EXISTS "idx_engagements_service_type"
  ON "engagements" USING btree ("service_type_id");

CREATE INDEX IF NOT EXISTS "idx_engagements_billing_entity"
  ON "engagements" USING btree ("billing_entity_id");

CREATE INDEX IF NOT EXISTS "idx_engagements_status"
  ON "engagements" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_engagements_partner"
  ON "engagements" USING btree ("partner_in_charge_id");

CREATE INDEX IF NOT EXISTS "idx_engagements_parent"
  ON "engagements" USING btree ("parent_engagement_id");

CREATE INDEX IF NOT EXISTS "idx_engagements_task_library_id"
  ON "engagements" USING btree ("task_library_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_engagements_task_library_id";
DROP INDEX IF EXISTS "idx_engagements_parent";
DROP INDEX IF EXISTS "idx_engagements_partner";
DROP INDEX IF EXISTS "idx_engagements_status";
DROP INDEX IF EXISTS "idx_engagements_billing_entity";
DROP INDEX IF EXISTS "idx_engagements_service_type";
DROP INDEX IF EXISTS "idx_engagements_client";
DROP INDEX IF EXISTS "idx_engagements_code";
DROP TABLE IF EXISTS "engagements";