-- @apply
-- @transaction single

-- Add new columns
ALTER TABLE IF EXISTS "payroll_readiness" ADD COLUMN IF NOT EXISTS "created_by" UUID NULL;
ALTER TABLE IF EXISTS "payroll_readiness" ADD COLUMN IF NOT EXISTS "updated_by" UUID NULL;

-- Ensure created_at and updated_at have proper defaults (idempotent)
ALTER TABLE IF EXISTS "payroll_readiness" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE IF EXISTS "payroll_readiness" ALTER COLUMN "updated_at" SET DEFAULT now();

-- @rollback
-- @transaction single

-- Revert default changes
ALTER TABLE IF EXISTS "payroll_readiness" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE IF EXISTS "payroll_readiness" ALTER COLUMN "created_at" DROP DEFAULT;

-- Drop added columns
ALTER TABLE IF EXISTS "payroll_readiness" DROP COLUMN IF EXISTS "updated_by";
ALTER TABLE IF EXISTS "payroll_readiness" DROP COLUMN IF EXISTS "created_by";