-- @apply
-- @transaction single

-- Personal details
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(20);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "blood_group" VARCHAR(10);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "father_guardian_name" VARCHAR(255);

-- Address
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "permanent_address" TEXT;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "permanent_pin" VARCHAR(10);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "current_address" TEXT;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "current_pin" VARCHAR(10);

-- Contact
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "alt_contact" VARCHAR(30);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "personal_email" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "official_email" VARCHAR(255);

-- Qualifications
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "highest_qualification" VARCHAR(100);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "ca_stage_level" VARCHAR(40);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "qualifications" JSONB;

-- ITT / Orientation tracking (FR-39)
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "itt_completed" VARCHAR(5);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "itt_date" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "orientation_completed" VARCHAR(5);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "orientation_date" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "industrial_training" BOOLEAN;

-- Articleship extended fields (FR-38)
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "articleship_registration_date" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "articleship_exit_form" VARCHAR(10);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "articleship_exit_date" DATE;

-- Past experience
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "previous_firm" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "previous_designation" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "tenure_from" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "tenure_to" DATE;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "last_drawn_ctc" TEXT;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "notice_period" VARCHAR(50);

-- Bank details extended
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "bank_account_holder" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "bank_name" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "bank_branch" VARCHAR(255);

-- Emergency contact
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "emergency_name" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "emergency_relationship" VARCHAR(100);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "emergency_mobile" VARCHAR(30);

-- Office-use signatory
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "authorised_signatory" VARCHAR(255);

-- Timestamped confidentiality undertaking (FR-41)
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "undertaking_accepted_at" TIMESTAMPTZ;
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "undertaking_signatory" VARCHAR(255);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "undertaking_place" VARCHAR(100);
ALTER TABLE IF EXISTS "employees" ADD COLUMN IF NOT EXISTS "undertaking_text" TEXT;

-- @rollback
-- @transaction single

-- Undertaking (FR-41)
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "undertaking_text";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "undertaking_place";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "undertaking_signatory";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "undertaking_accepted_at";

-- Office-use signatory
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "authorised_signatory";

-- Emergency contact
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "emergency_mobile";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "emergency_relationship";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "emergency_name";

-- Bank details extended
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "bank_branch";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "bank_name";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "bank_account_holder";

-- Past experience
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "notice_period";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "last_drawn_ctc";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "tenure_to";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "tenure_from";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "previous_designation";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "previous_firm";

-- Articleship extended (FR-38)
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "articleship_exit_date";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "articleship_exit_form";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "articleship_registration_date";

-- ITT / Orientation (FR-39)
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "industrial_training";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "orientation_date";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "orientation_completed";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "itt_date";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "itt_completed";

-- Qualifications
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "qualifications";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "ca_stage_level";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "highest_qualification";

-- Contact
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "official_email";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "personal_email";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "alt_contact";

-- Address
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "current_pin";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "current_address";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "permanent_pin";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "permanent_address";

-- Personal details
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "father_guardian_name";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "blood_group";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "gender";
ALTER TABLE IF EXISTS "employees" DROP COLUMN IF EXISTS "date_of_birth";