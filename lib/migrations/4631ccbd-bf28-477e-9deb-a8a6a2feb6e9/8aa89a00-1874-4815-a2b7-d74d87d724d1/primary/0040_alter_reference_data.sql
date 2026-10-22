-- @apply
-- @transaction single

-- Drop the overly restrictive CHECK constraint on "type"
ALTER TABLE IF EXISTS "reference_data" DROP CONSTRAINT IF EXISTS "chk_reference_data_type";

-- Add created_at column if it does not exist
ALTER TABLE IF EXISTS "reference_data" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add updated_at column if it does not exist
ALTER TABLE IF EXISTS "reference_data" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- @rollback
-- @transaction single

-- Drop the columns added by this migration
ALTER TABLE IF EXISTS "reference_data" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE IF EXISTS "reference_data" DROP COLUMN IF EXISTS "created_at";

-- Restore the CHECK constraint on "type"
ALTER TABLE IF EXISTS "reference_data" DROP CONSTRAINT IF EXISTS "chk_reference_data_type";
ALTER TABLE IF EXISTS "reference_data" ADD CONSTRAINT "chk_reference_data_type" CHECK ("type" IN ('entity_type','delay_reason','payment_mode','position_type'));