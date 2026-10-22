/**
 * FR-03: which role permissions open which pages. Used by the sidebar to hide
 * modules a role cannot use, and by the shell to show "no access" instead of
 * an empty page. The API routes remain the real enforcement.
 *
 * Client-safe: no server imports.
 */

export type PermissionMap = Record<string, boolean>;

const SETTINGS_PERMISSIONS = [
  "manage_roles",
  "manage_users",
  "manage_entities",
  "manage_reference_data",
  "manage_settings",
];

/** Longest matching prefix wins. Pages not listed are open to every signed-in user. */
const ROUTE_RULES: { prefix: string; exact?: boolean; anyOf: string[] }[] = [
  { prefix: "/dashboard", exact: true, anyOf: ["view_dashboard"] },
  { prefix: "/dashboard/clients/onboarding", anyOf: ["onboard_clients"] },
  { prefix: "/dashboard/clients/groups", anyOf: ["edit_clients"] },
  { prefix: "/dashboard/clients", anyOf: ["view_clients"] },
  { prefix: "/dashboard/employees/onboarding", anyOf: ["create_employees"] },
  // Gap #47: the directory itself is for those who see every employee; staff who
  // see only their own record reach it through "My profile" and its detail page.
  { prefix: "/dashboard/employees", exact: true, anyOf: ["view_employees"] },
  { prefix: "/dashboard/employees", anyOf: ["view_employees", "view_own_employee"] },
  { prefix: "/dashboard/engagements", anyOf: ["view_engagements"] },
  { prefix: "/dashboard/libraries", anyOf: ["view_tasks"] },
  { prefix: "/dashboard/tasks", anyOf: ["view_tasks"] },
  { prefix: "/dashboard/payroll", anyOf: ["view_payroll"] },
  { prefix: "/dashboard/billing/invoices/new", anyOf: ["create_invoices"] },
  { prefix: "/dashboard/billing", anyOf: ["view_billing"] },
  { prefix: "/dashboard/compliance", anyOf: ["view_compliance"] },
  { prefix: "/dashboard/finance", anyOf: ["view_finance"] },
  { prefix: "/dashboard/reports", anyOf: ["view_reports"] },
  { prefix: "/dashboard/settings/roles", anyOf: ["manage_roles"] },
  { prefix: "/dashboard/settings/users", anyOf: ["manage_users"] },
  { prefix: "/dashboard/settings/entities", anyOf: ["manage_entities"] },
  { prefix: "/dashboard/settings/reference-data", anyOf: ["manage_reference_data"] },
  { prefix: "/dashboard/settings/document-types", anyOf: ["manage_reference_data", "manage_settings"] },
  { prefix: "/dashboard/settings/gst-rates", anyOf: ["manage_settings", "create_invoices"] },
  { prefix: "/dashboard/settings/migration", anyOf: ["manage_settings"] },
  { prefix: "/dashboard/settings/integrations", anyOf: ["manage_settings"] },
  { prefix: "/dashboard/settings", anyOf: SETTINGS_PERMISSIONS },
];

function matches(path: string, rule: { prefix: string; exact?: boolean }): boolean {
  if (rule.exact) return path === rule.prefix;
  return path === rule.prefix || path.startsWith(rule.prefix + "/");
}

export function canAccessPath(path: string, permissions: PermissionMap): boolean {
  let best: { prefix: string; anyOf: string[] } | null = null;
  for (const rule of ROUTE_RULES) {
    if (matches(path, rule) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  if (!best) return true;
  return best.anyOf.some((p) => permissions[p] === true);
}
