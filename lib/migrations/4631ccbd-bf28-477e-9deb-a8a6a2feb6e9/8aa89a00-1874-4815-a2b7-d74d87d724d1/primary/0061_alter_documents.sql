-- @apply
-- @transaction single

-- 1. Add default to "id" column if not already set
ALTER TABLE IF EXISTS "documents"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- 2. Change owner_type from varchar(30) to varchar(20)
--    Note: This will fail if existing data exceeds 20 chars.
--    Per operator guidance, we are updating the CHECK constraint to allow 'entity'.
--    We keep varchar(20) as specified in new schema since all enum values fit.
ALTER TABLE IF EXISTS "documents"
  ALTER COLUMN "owner_type" TYPE varchar(20);

-- 3. Drop the old CHECK constraint on owner_type
--    The old constraint may have various names; we drop known possibilities.
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "chk_documents_owner_type";
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "documents_owner_type_check";

-- 4. Add the new CHECK constraint on owner_type, now including 'entity'
--    per operator guidance (Gap #63)
ALTER TABLE IF EXISTS "documents"
  ADD CONSTRAINT "chk_documents_owner_type"
  CHECK (("owner_type")::text = ANY ((ARRAY['client'::character varying, 'employee'::character varying, 'engagement'::character varying, 'entity'::character varying])::text[]));

-- 5. Drop the old CHECK constraint on document_type (ensure idempotent re-add)
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "chk_documents_document_type";
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "documents_document_type_check";

-- 6. Re-add the CHECK constraint on document_type (unchanged values, but ensures named constraint exists)
ALTER TABLE IF EXISTS "documents"
  ADD CONSTRAINT "chk_documents_document_type"
  CHECK (("document_type")::text = ANY ((ARRAY['card'::character varying, 'engagement'::character varying])::text[]));

-- Indexes already exist, no changes needed
-- idx_documents_owner, idx_documents_uploaded_by, idx_documents_expiry

-- @rollback
-- @transaction single

-- 1. Drop the new CHECK constraint on document_type and restore original
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "chk_documents_document_type";

ALTER TABLE IF EXISTS "documents"
  ADD CONSTRAINT "documents_document_type_check"
  CHECK (("document_type")::text = ANY ((ARRAY['card'::character varying, 'engagement'::character varying])::text[]));

-- 2. Drop the new CHECK constraint on owner_type and restore original (without 'entity')
ALTER TABLE IF EXISTS "documents"
  DROP CONSTRAINT IF EXISTS "chk_documents_owner_type";

ALTER TABLE IF EXISTS "documents"
  ADD CONSTRAINT "documents_owner_type_check"
  CHECK (("owner_type")::text = ANY ((ARRAY['client'::character varying, 'employee'::character varying, 'engagement'::character varying])::text[]));

-- 3. Revert owner_type back to varchar(30)
ALTER TABLE IF EXISTS "documents"
  ALTER COLUMN "owner_type" TYPE varchar(30);

-- 4. Remove default from "id" column (original had no default specified)
ALTER TABLE IF EXISTS "documents"
  ALTER COLUMN "id" DROP DEFAULT;