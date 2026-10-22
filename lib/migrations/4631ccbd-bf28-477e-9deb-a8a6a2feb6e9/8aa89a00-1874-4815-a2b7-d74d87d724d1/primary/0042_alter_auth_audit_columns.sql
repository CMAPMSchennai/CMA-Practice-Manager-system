-- AUTO-GENERATED — platform auth audit columns (created_at / updated_at).
-- Forward migration for apps whose users/accounts/sessions CREATE files
-- predate include_audit_columns. Original CREATE migrations are left
-- untouched (assertNoAppliedOverwrite). Safe to re-run (IF NOT EXISTS).

-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "auth_audit_columns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "marker" TEXT NOT NULL DEFAULT 'applied',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "accounts" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "accounts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "sessions" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "sessions" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "sessions" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE IF EXISTS "sessions" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE IF EXISTS "accounts" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE IF EXISTS "accounts" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "updated_at";

DROP TABLE IF EXISTS "auth_audit_columns";