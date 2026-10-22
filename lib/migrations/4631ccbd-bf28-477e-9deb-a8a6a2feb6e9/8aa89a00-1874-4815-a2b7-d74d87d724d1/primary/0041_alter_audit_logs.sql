-- @apply
-- @transaction single

-- 1. Drop the CHECK constraint on "action"
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS chk_audit_logs_action;

-- 2. Change "action" column type from VARCHAR(50) to TEXT
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" TYPE TEXT;

-- 3. Drop the default on "action" (old default was 'create', new schema has no default)
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" DROP DEFAULT;

-- 4. Make "action" nullable (was NOT NULL, now nullable)
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" DROP NOT NULL;

-- @rollback
-- @transaction single

-- 1. Restore "action" to NOT NULL (set any NULLs to 'create' first)
UPDATE "audit_logs" SET "action" = 'create' WHERE "action" IS NULL;
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" SET NOT NULL;

-- 2. Restore the default on "action"
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" SET DEFAULT 'create';

-- 3. Change "action" column type back to VARCHAR(50)
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "action" TYPE VARCHAR(50);

-- 4. Restore the CHECK constraint on "action"
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS chk_audit_logs_action;
ALTER TABLE IF EXISTS "audit_logs" ADD CONSTRAINT chk_audit_logs_action CHECK (action IN ('create','update','delete','status_change','login','logout','permission_change','salary_release','override'));