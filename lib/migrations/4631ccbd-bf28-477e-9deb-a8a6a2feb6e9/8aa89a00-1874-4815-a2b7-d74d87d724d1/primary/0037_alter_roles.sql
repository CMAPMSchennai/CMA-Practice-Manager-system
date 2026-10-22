-- @apply
-- @transaction single

-- Add missing timestamp columns
ALTER TABLE IF EXISTS "roles" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS "roles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Seed the 6 default RBAC roles
INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'managing_partner',
  'Managing Partner — full access to all system actions including payroll release, erasure, and onboarding override.',
  '{
    "view_clients": true, "create_clients": true, "edit_clients": true, "delete_clients": true, "onboard_clients": true,
    "view_employees": true, "create_employees": true, "edit_employees": true, "delete_employees": true, "view_own_employee": true,
    "view_engagements": true, "create_engagements": true, "edit_engagements": true, "delete_engagements": true,
    "view_tasks": true, "create_tasks": true, "edit_tasks": true, "delete_tasks": true, "review_tasks": true,
    "view_payroll": true, "create_payroll": true, "release_payroll": true,
    "view_billing": true, "create_invoices": true, "edit_invoices": true, "delete_invoices": true, "record_receipts": true,
    "view_finance": true, "create_expenses": true, "edit_expenses": true,
    "view_compliance": true, "manage_compliance": true,
    "view_reports": true, "export_reports": true,
    "view_documents": true, "upload_documents": true, "delete_documents": true,
    "view_audit_logs": true,
    "send_notifications": true, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": true, "manage_users": true, "manage_entities": true, "manage_reference_data": true, "manage_settings": true,
    "erasure": true, "onboarding_override": true
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'partner',
  'Partner — full client, engagement, billing and compliance access; no system administration or hard-locked actions.',
  '{
    "view_clients": true, "create_clients": true, "edit_clients": true, "delete_clients": false, "onboard_clients": true,
    "view_employees": true, "create_employees": false, "edit_employees": false, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": true, "edit_engagements": true, "delete_engagements": false,
    "view_tasks": true, "create_tasks": true, "edit_tasks": true, "delete_tasks": false, "review_tasks": true,
    "view_payroll": true, "create_payroll": false, "release_payroll": false,
    "view_billing": true, "create_invoices": true, "edit_invoices": true, "delete_invoices": false, "record_receipts": true,
    "view_finance": true, "create_expenses": false, "edit_expenses": false,
    "view_compliance": true, "manage_compliance": true,
    "view_reports": true, "export_reports": true,
    "view_documents": true, "upload_documents": true, "delete_documents": false,
    "view_audit_logs": true,
    "send_notifications": true, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": false, "manage_users": false, "manage_entities": false, "manage_reference_data": false, "manage_settings": false,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'admin',
  'Administrator — system configuration, user/role management and most operational permissions; no hard-locked payroll or erasure actions.',
  '{
    "view_clients": true, "create_clients": true, "edit_clients": true, "delete_clients": false, "onboard_clients": true,
    "view_employees": true, "create_employees": true, "edit_employees": true, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": true, "edit_engagements": true, "delete_engagements": false,
    "view_tasks": true, "create_tasks": true, "edit_tasks": true, "delete_tasks": false, "review_tasks": false,
    "view_payroll": true, "create_payroll": false, "release_payroll": false,
    "view_billing": true, "create_invoices": true, "edit_invoices": true, "delete_invoices": false, "record_receipts": true,
    "view_finance": true, "create_expenses": true, "edit_expenses": false,
    "view_compliance": true, "manage_compliance": false,
    "view_reports": true, "export_reports": true,
    "view_documents": true, "upload_documents": true, "delete_documents": false,
    "view_audit_logs": true,
    "send_notifications": true, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": true, "manage_users": true, "manage_entities": true, "manage_reference_data": true, "manage_settings": true,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'manager',
  'Manager — operational view and edit access; no system admin, billing creation, payroll release or hard-locked actions.',
  '{
    "view_clients": true, "create_clients": false, "edit_clients": true, "delete_clients": false, "onboard_clients": false,
    "view_employees": true, "create_employees": false, "edit_employees": false, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": false, "edit_engagements": true, "delete_engagements": false,
    "view_tasks": true, "create_tasks": true, "edit_tasks": true, "delete_tasks": false, "review_tasks": true,
    "view_payroll": true, "create_payroll": false, "release_payroll": false,
    "view_billing": true, "create_invoices": false, "edit_invoices": false, "delete_invoices": false, "record_receipts": false,
    "view_finance": true, "create_expenses": false, "edit_expenses": false,
    "view_compliance": true, "manage_compliance": false,
    "view_reports": true, "export_reports": true,
    "view_documents": true, "upload_documents": true, "delete_documents": false,
    "view_audit_logs": false,
    "send_notifications": true, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": false, "manage_users": false, "manage_entities": false, "manage_reference_data": false, "manage_settings": false,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'senior_associate',
  'Senior Associate — day-to-day task and engagement execution with limited financial visibility; no admin or hard-locked actions.',
  '{
    "view_clients": true, "create_clients": false, "edit_clients": false, "delete_clients": false, "onboard_clients": false,
    "view_employees": false, "create_employees": false, "edit_employees": false, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": false, "edit_engagements": false, "delete_engagements": false,
    "view_tasks": true, "create_tasks": true, "edit_tasks": true, "delete_tasks": false, "review_tasks": false,
    "view_payroll": false, "create_payroll": false, "release_payroll": false,
    "view_billing": true, "create_invoices": false, "edit_invoices": false, "delete_invoices": false, "record_receipts": false,
    "view_finance": false, "create_expenses": false, "edit_expenses": false,
    "view_compliance": true, "manage_compliance": false,
    "view_reports": true, "export_reports": false,
    "view_documents": true, "upload_documents": true, "delete_documents": false,
    "view_audit_logs": false,
    "send_notifications": false, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": false, "manage_users": false, "manage_entities": false, "manage_reference_data": false, "manage_settings": false,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'associate',
  'Associate — basic task execution and document viewing; minimal permissions with no financial, admin, or hard-locked access.',
  '{
    "view_clients": true, "create_clients": false, "edit_clients": false, "delete_clients": false, "onboard_clients": false,
    "view_employees": false, "create_employees": false, "edit_employees": false, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": false, "edit_engagements": false, "delete_engagements": false,
    "view_tasks": true, "create_tasks": false, "edit_tasks": true, "delete_tasks": false, "review_tasks": false,
    "view_payroll": false, "create_payroll": false, "release_payroll": false,
    "view_billing": false, "create_invoices": false, "edit_invoices": false, "delete_invoices": false, "record_receipts": false,
    "view_finance": false, "create_expenses": false, "edit_expenses": false,
    "view_compliance": false, "manage_compliance": false,
    "view_reports": false, "export_reports": false,
    "view_documents": true, "upload_documents": true, "delete_documents": false,
    "view_audit_logs": false,
    "send_notifications": false, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": false, "manage_users": false, "manage_entities": false, "manage_reference_data": false, "manage_settings": false,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "roles" ("id", "name", "description", "permissions", "is_seeded", "is_custom", "cloned_from")
VALUES (
  gen_random_uuid(),
  'articled_clerk',
  'Articled Clerk — read-only access to assigned tasks and documents; most restrictive role with no edit, financial, or admin permissions.',
  '{
    "view_clients": true, "create_clients": false, "edit_clients": false, "delete_clients": false, "onboard_clients": false,
    "view_employees": false, "create_employees": false, "edit_employees": false, "delete_employees": false, "view_own_employee": true,
    "view_engagements": true, "create_engagements": false, "edit_engagements": false, "delete_engagements": false,
    "view_tasks": true, "create_tasks": false, "edit_tasks": false, "delete_tasks": false, "review_tasks": false,
    "view_payroll": false, "create_payroll": false, "release_payroll": false,
    "view_billing": false, "create_invoices": false, "edit_invoices": false, "delete_invoices": false, "record_receipts": false,
    "view_finance": false, "create_expenses": false, "edit_expenses": false,
    "view_compliance": false, "manage_compliance": false,
    "view_reports": false, "export_reports": false,
    "view_documents": true, "upload_documents": false, "delete_documents": false,
    "view_audit_logs": false,
    "send_notifications": false, "view_notifications": true,
    "view_dashboard": true,
    "manage_roles": false, "manage_users": false, "manage_entities": false, "manage_reference_data": false, "manage_settings": false,
    "erasure": false, "onboarding_override": false
  }'::jsonb,
  true,
  false,
  NULL
)
ON CONFLICT ("name") DO NOTHING;

-- @rollback
-- @transaction single

-- Remove seeded roles
DELETE FROM "roles" WHERE "name" = 'articled_clerk' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'associate' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'senior_associate' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'manager' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'admin' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'partner' AND "is_seeded" = true;
DELETE FROM "roles" WHERE "name" = 'managing_partner' AND "is_seeded" = true;

-- Drop added timestamp columns
ALTER TABLE IF EXISTS "roles" DROP COLUMN IF EXISTS "updated_at";
ALTER TABLE IF EXISTS "roles" DROP COLUMN IF EXISTS "created_at";