-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "onboarding_tokens" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "token"         TEXT NOT NULL UNIQUE,
  "client_id"     UUID NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expires_at"    TIMESTAMPTZ NOT NULL,
  "used_at"       TIMESTAMPTZ,
  "generated_by"  UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_onboarding_tokens_token"
  ON "onboarding_tokens" ("token");

CREATE INDEX IF NOT EXISTS "idx_onboarding_tokens_client"
  ON "onboarding_tokens" ("client_id");

CREATE INDEX IF NOT EXISTS "idx_onboarding_tokens_generated_by"
  ON "onboarding_tokens" ("generated_by");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_tokens_client_id_generated_by"
  ON "onboarding_tokens" ("client_id", "generated_by");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "uq_onboarding_tokens_client_id_generated_by";
DROP INDEX IF EXISTS "idx_onboarding_tokens_generated_by";
DROP INDEX IF EXISTS "idx_onboarding_tokens_client";
DROP INDEX IF EXISTS "idx_onboarding_tokens_token";
DROP TABLE IF EXISTS "onboarding_tokens";