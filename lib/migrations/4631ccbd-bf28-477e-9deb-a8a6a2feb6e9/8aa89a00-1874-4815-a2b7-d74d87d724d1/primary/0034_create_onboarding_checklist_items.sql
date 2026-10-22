-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "onboarding_checklist_items" (
  "id"                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "owner_type"             VARCHAR(20) NOT NULL,
  "owner_id"               UUID        NOT NULL,
  "checklist_item_code"    VARCHAR(50) NOT NULL,
  "label"                  VARCHAR(255) NOT NULL,
  "is_complete"            BOOLEAN     NOT NULL DEFAULT false,
  "completed_by"           UUID        REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "completed_at"           TIMESTAMPTZ,
  "notes"                  TEXT,
  "override_by"            UUID        REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "override_justification" TEXT,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_onboarding_checklist_items_owner_type CHECK (owner_type IN ('client','employee'))
);

CREATE INDEX IF NOT EXISTS "idx_onboarding_checklist_owner"
  ON "onboarding_checklist_items" ("owner_type", "owner_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_onboarding_checklist_code"
  ON "onboarding_checklist_items" ("owner_type", "owner_id", "checklist_item_code");

CREATE INDEX IF NOT EXISTS "idx_onboarding_checklist_items_completed_by"
  ON "onboarding_checklist_items" ("completed_by");

CREATE INDEX IF NOT EXISTS "idx_onboarding_checklist_items_override_by"
  ON "onboarding_checklist_items" ("override_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_onboarding_checklist_items_override_by";
DROP INDEX IF EXISTS "idx_onboarding_checklist_items_completed_by";
DROP INDEX IF EXISTS "idx_onboarding_checklist_code";
DROP INDEX IF EXISTS "idx_onboarding_checklist_owner";
DROP TABLE IF EXISTS "onboarding_checklist_items";