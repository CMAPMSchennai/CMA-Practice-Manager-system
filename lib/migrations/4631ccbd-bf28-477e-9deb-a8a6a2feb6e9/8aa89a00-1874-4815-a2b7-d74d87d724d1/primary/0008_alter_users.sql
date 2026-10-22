-- @apply
-- @transaction single

-- Add new columns
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "role_id" UUID DEFAULT NULL;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "employee_id" UUID DEFAULT NULL;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "entity_access_scope" JSONB DEFAULT NULL;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMPTZ DEFAULT NULL;

-- Add foreign key constraints (idempotent: drop if exists, then add)
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS fk_users_role_id;
ALTER TABLE IF EXISTS "users" ADD CONSTRAINT fk_users_role_id
  FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS fk_users_employee_id;
ALTER TABLE IF EXISTS "users" ADD CONSTRAINT fk_users_employee_id
  FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON "users" ("role_id");
CREATE INDEX IF NOT EXISTS idx_users_employee ON "users" ("employee_id");
CREATE INDEX IF NOT EXISTS idx_users_is_active ON "users" ("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id_role_id ON "users" ("employee_id", "role_id");

-- @rollback
-- @transaction single

-- Drop indexes
DROP INDEX IF EXISTS uq_users_employee_id_role_id;
DROP INDEX IF EXISTS idx_users_is_active;
DROP INDEX IF EXISTS idx_users_employee;
DROP INDEX IF EXISTS idx_users_role;

-- Drop foreign key constraints
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS fk_users_employee_id;
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS fk_users_role_id;

-- Drop new columns
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "last_active_at";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "is_active";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "entity_access_scope";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "employee_id";
ALTER TABLE IF EXISTS "users" DROP COLUMN IF EXISTS "role_id";