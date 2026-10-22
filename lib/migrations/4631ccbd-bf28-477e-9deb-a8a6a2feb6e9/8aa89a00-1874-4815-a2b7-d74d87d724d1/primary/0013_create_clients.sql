-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "clients" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_code"           VARCHAR(50) NOT NULL,
  "name"                  VARCHAR(500) NOT NULL,
  "trade_name"            VARCHAR(500),
  "entity_type_id"        UUID,
  "pan"                   TEXT,
  "gstin"                 VARCHAR(15),
  "address"               TEXT,
  "contact_person"        VARCHAR(255),
  "contact_email"         VARCHAR(255),
  "contact_phone"         VARCHAR(20),
  "group_id"              UUID,
  "partner_in_charge_id"  UUID,
  "onboarding_status"     VARCHAR(50) NOT NULL DEFAULT 'imported',
  "is_active"             BOOLEAN NOT NULL DEFAULT true,
  "notes"                 TEXT,
  "migration_batch_id"    UUID,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "pk_clients" PRIMARY KEY ("id"),
  CONSTRAINT "uq_clients_client_code" UNIQUE ("client_code"),

  CONSTRAINT "chk_clients_onboarding_status" CHECK (
    "onboarding_status" IN ('imported','kyc_and_docs','conflict_check','engagement_letter','activated')
  ),

  CONSTRAINT "fk_clients_entity_type_id"
    FOREIGN KEY ("entity_type_id")
    REFERENCES "reference_data" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "fk_clients_group_id"
    FOREIGN KEY ("group_id")
    REFERENCES "client_groups" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT "fk_clients_partner_in_charge_id"
    FOREIGN KEY ("partner_in_charge_id")
    REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_clients_client_code"
  ON "clients" USING btree ("client_code");

CREATE INDEX IF NOT EXISTS "idx_clients_entity_type"
  ON "clients" USING btree ("entity_type_id");

CREATE INDEX IF NOT EXISTS "idx_clients_group"
  ON "clients" USING btree ("group_id");

CREATE INDEX IF NOT EXISTS "idx_clients_partner"
  ON "clients" USING btree ("partner_in_charge_id");

CREATE INDEX IF NOT EXISTS "idx_clients_onboarding_status"
  ON "clients" USING btree ("onboarding_status");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_clients_onboarding_status";
DROP INDEX IF EXISTS "idx_clients_partner";
DROP INDEX IF EXISTS "idx_clients_group";
DROP INDEX IF EXISTS "idx_clients_entity_type";
DROP INDEX IF EXISTS "idx_clients_client_code";
DROP TABLE IF EXISTS "clients";