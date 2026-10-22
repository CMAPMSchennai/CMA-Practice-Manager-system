-- @apply
-- @transaction single

-- New column: incorporation_date
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "incorporation_date" DATE NULL;

-- New column: registration_no
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "registration_no" VARCHAR(50) NULL;

-- New column: city
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "city" VARCHAR(100) NULL;

-- New column: state
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "state" VARCHAR(100) NULL;

-- New column: pin
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "pin" VARCHAR(10) NULL;

-- New column: designation
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "designation" VARCHAR(100) NULL;

-- New column: preferred_communication
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "preferred_communication" VARCHAR(20) NULL;

-- New column: financial_year_end_month
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "financial_year_end_month" SMALLINT NULL;

-- New column: billing_email
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "billing_email" VARCHAR(255) NULL;

-- New column: onboarding_submission (stored form JSON)
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "onboarding_submission" JSONB NULL;

-- New column: submitted_at
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMPTZ NULL;

-- @rollback
-- @transaction single

ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "submitted_at";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "onboarding_submission";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "billing_email";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "financial_year_end_month";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "preferred_communication";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "designation";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "pin";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "state";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "city";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "registration_no";
ALTER TABLE IF EXISTS "clients" DROP COLUMN IF EXISTS "incorporation_date";