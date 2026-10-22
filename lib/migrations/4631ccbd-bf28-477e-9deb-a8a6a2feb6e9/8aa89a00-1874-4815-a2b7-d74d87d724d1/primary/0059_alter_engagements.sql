-- @apply
-- @transaction single

-- The fee_basis column's CHECK constraint needs to be updated to include
-- 'per_month' and 'per_visit' in addition to existing values.
-- The new schema shows check_constraint as null but enum_values are provided,
-- so we replace the old constraint with an updated one.

-- Drop the old fee_basis CHECK constraint (may have various names from prior migrations)
DO $$
BEGIN
    -- Try to find and drop any existing check constraint on fee_basis
    PERFORM 1 FROM information_schema.constraint_column_usage ccu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    WHERE ccu.table_name = 'engagements'
      AND ccu.column_name = 'fee_basis'
      AND tc.constraint_type = 'CHECK';

    IF FOUND THEN
        -- Drop all check constraints that reference fee_basis
        DECLARE
            _cname TEXT;
        BEGIN
            FOR _cname IN
                SELECT tc.constraint_name
                FROM information_schema.constraint_column_usage ccu
                JOIN information_schema.table_constraints tc
                  ON tc.constraint_name = ccu.constraint_name
                 AND tc.table_schema = ccu.table_schema
                WHERE ccu.table_name = 'engagements'
                  AND ccu.column_name = 'fee_basis'
                  AND tc.constraint_type = 'CHECK'
            LOOP
                EXECUTE format('ALTER TABLE "engagements" DROP CONSTRAINT IF EXISTS %I', _cname);
            END LOOP;
        END;
    END IF;
END
$$;

-- Also explicitly drop the named constraint we will create, for idempotency
ALTER TABLE IF EXISTS "engagements" DROP CONSTRAINT IF EXISTS chk_engagements_fee_basis;

-- Add the new CHECK constraint with the expanded enum values
ALTER TABLE IF EXISTS "engagements"
    ADD CONSTRAINT chk_engagements_fee_basis
    CHECK (("fee_basis")::text = ANY ((ARRAY[
        'fixed'::character varying,
        'per_month'::character varying,
        'per_visit'::character varying,
        'hourly'::character varying,
        'retainer'::character varying,
        'value_based'::character varying
    ])::text[]));

-- @rollback
-- @transaction single

-- Remove the new CHECK constraint
ALTER TABLE IF EXISTS "engagements" DROP CONSTRAINT IF EXISTS chk_engagements_fee_basis;

-- Restore the original CHECK constraint with only the old enum values
-- First, find and drop any existing check on fee_basis (idempotency)
DO $$
DECLARE
    _cname TEXT;
BEGIN
    FOR _cname IN
        SELECT tc.constraint_name
        FROM information_schema.constraint_column_usage ccu
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE ccu.table_name = 'engagements'
          AND ccu.column_name = 'fee_basis'
          AND tc.constraint_type = 'CHECK'
    LOOP
        EXECUTE format('ALTER TABLE "engagements" DROP CONSTRAINT IF EXISTS %I', _cname);
    END LOOP;
END
$$;

ALTER TABLE IF EXISTS "engagements"
    ADD CONSTRAINT chk_engagements_fee_basis
    CHECK (("fee_basis")::text = ANY ((ARRAY[
        'fixed'::character varying,
        'hourly'::character varying,
        'retainer'::character varying,
        'value_based'::character varying
    ])::text[]));