-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "employees" (
  "id"                              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "employee_id_code"                VARCHAR(20)  NOT NULL,
  "user_id"                         UUID,
  "first_name"                      VARCHAR(255) NOT NULL,
  "last_name"                       VARCHAR(255),
  "email"                           VARCHAR(255),
  "phone"                           VARCHAR(20),
  "position_type"                   VARCHAR(50)  NOT NULL,
  "designation"                     VARCHAR(255),
  "payroll_entity_id"               UUID         NOT NULL,
  "date_of_joining"                 DATE,
  "date_of_leaving"                 DATE,
  "salary"                          NUMERIC(15,2),
  "pan"                             TEXT,
  "aadhaar"                         TEXT,
  "bank_account_no"                 TEXT,
  "bank_ifsc"                       VARCHAR(11),
  "icai_membership_no"              VARCHAR(50),
  "icai_registration_no"            VARCHAR(50),
  "articleship_start_date"          DATE,
  "articleship_end_date"            DATE,
  "assigned_mentor_partner_id"      UUID,
  "confidentiality_undertaking_signed" BOOLEAN   NOT NULL,
  "status"                          VARCHAR(30)  NOT NULL DEFAULT 'active',
  "version"                         INTEGER      NOT NULL DEFAULT 0,
  "migration_batch_id"              UUID,
  "created_at"                      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"                      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "pk_employees" PRIMARY KEY ("id"),
  CONSTRAINT "uq_employees_employee_id_code" UNIQUE ("employee_id_code"),
  CONSTRAINT "chk_employees_position_type" CHECK ("position_type" IN ('partner','paid_assistant','articled_clerk','support_staff')),
  CONSTRAINT "chk_employees_status" CHECK ("status" IN ('active','resigned','terminated','on_leave')),
  CONSTRAINT "fk_employees_user_id" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_employees_payroll_entity_id" FOREIGN KEY ("payroll_entity_id")
    REFERENCES "entities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fk_employees_assigned_mentor_partner_id" FOREIGN KEY ("assigned_mentor_partner_id")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_employees_employee_id_code"
  ON "employees" USING btree ("employee_id_code");

CREATE INDEX IF NOT EXISTS "idx_employees_user"
  ON "employees" USING btree ("user_id");

CREATE INDEX IF NOT EXISTS "idx_employees_payroll_entity"
  ON "employees" USING btree ("payroll_entity_id");

CREATE INDEX IF NOT EXISTS "idx_employees_position_type"
  ON "employees" USING btree ("position_type");

CREATE INDEX IF NOT EXISTS "idx_employees_status"
  ON "employees" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_employees_mentor"
  ON "employees" USING btree ("assigned_mentor_partner_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS "idx_employees_mentor";
DROP INDEX IF EXISTS "idx_employees_status";
DROP INDEX IF EXISTS "idx_employees_position_type";
DROP INDEX IF EXISTS "idx_employees_payroll_entity";
DROP INDEX IF EXISTS "idx_employees_user";
DROP INDEX IF EXISTS "idx_employees_employee_id_code";
DROP TABLE IF EXISTS "employees";