/**
 * RBAC engine for CMA Practice Manager.
 *
 * Six seeded roles with action-level permissions. The `roles` table
 * stores permissions as JSONB. This module provides helpers to:
 *  - Look up a user's role and permissions from the DB
 *  - Check whether a user has a specific permission
 *  - Enforce role gates in API handlers
 *
 * Seeded role names (from requirements):
 *  managing_partner, partner, admin, manager, paid_assistant, articled_clerk
 */

import { query, pool, isMockMode } from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/auth-helpers";
import { ensureMasterDataSeeded } from "@/lib/master-seed";
import { ensureEmployeeChecklistsMigrated } from "@/lib/employee-checklist";
import { ensureTaskLibrariesSeeded } from "@/lib/task-library-seed";
import { getPasswordChangeState } from "@/lib/temp-password";
import type { NextRequest } from "next/server";

/** The six seeded roles + any custom clones */
export const SEEDED_ROLE_NAMES = [
  "managing_partner",
  "partner",
  "admin",
  "manager",
  "paid_assistant",
  "articled_clerk",
] as const;

export type SeededRoleName = (typeof SEEDED_ROLE_NAMES)[number];

/** Actions that can appear in the permissions JSONB */
export const ALL_ACTIONS = [
  // Settings / admin
  "manage_roles",
  "manage_users",
  "manage_entities",
  "manage_reference_data",
  "manage_settings",
  // Clients
  "view_clients",
  "create_clients",
  "edit_clients",
  "delete_clients",
  "onboard_clients",
  // Employees
  "view_employees",
  "create_employees",
  "edit_employees",
  "delete_employees",
  "view_own_employee",
  // Engagements
  "view_engagements",
  "create_engagements",
  "edit_engagements",
  "delete_engagements",
  // Tasks
  "view_tasks",
  "create_tasks",
  "edit_tasks",
  "review_tasks",
  // Payroll
  "view_payroll",
  "payroll_release",
  // Billing
  "view_billing",
  "create_invoices",
  "edit_invoices",
  "record_receipts",
  // Finance
  "view_finance",
  "create_expenses",
  // Compliance
  "view_compliance",
  "manage_compliance",
  // Reports
  "view_reports",
  "export_reports",
  // Documents
  "view_documents",
  "upload_documents",
  // Audit
  "view_audit_logs",
  // Notifications
  "send_notifications",
  "view_notifications",
  // Erasure / DPDP
  "manage_erasure",
  // Dashboard
  "view_dashboard",
  // Override
  "onboarding_override",
] as const;

export type ActionName = (typeof ALL_ACTIONS)[number];

/**
 * Hard-locked actions that ONLY managing_partner can have.
 * These cannot be granted to other roles even via clone + edit.
 */
export const HARD_LOCKED_ACTIONS: ActionName[] = [
  "payroll_release",
  "manage_erasure",
  "onboarding_override",
];

/** Default permissions matrix for each seeded role */
export function getSeededPermissions(roleName: string): Record<string, boolean> {
  const base: Record<string, boolean> = {};
  for (const a of ALL_ACTIONS) base[a] = false;

  switch (roleName) {
    case "managing_partner":
      // Full access
      for (const a of ALL_ACTIONS) base[a] = true;
      break;
    case "partner":
      Object.assign(base, {
        view_clients: true, create_clients: true, edit_clients: true, onboard_clients: true,
        view_employees: true, view_own_employee: true,
        view_engagements: true, create_engagements: true, edit_engagements: true,
        view_tasks: true, create_tasks: true, edit_tasks: true, review_tasks: true,
        view_payroll: true,
        view_billing: true, create_invoices: true, edit_invoices: true, record_receipts: true,
        view_finance: true,
        view_compliance: true, manage_compliance: true,
        view_reports: true, export_reports: true,
        view_documents: true, upload_documents: true,
        view_audit_logs: true,
        send_notifications: true, view_notifications: true,
        view_dashboard: true,
      });
      break;
    case "admin":
      Object.assign(base, {
        manage_roles: true, manage_users: true, manage_entities: true,
        manage_reference_data: true, manage_settings: true,
        view_clients: true, create_clients: true, edit_clients: true, onboard_clients: true,
        view_employees: true, create_employees: true, edit_employees: true, view_own_employee: true,
        view_engagements: true, create_engagements: true, edit_engagements: true,
        view_tasks: true, create_tasks: true, edit_tasks: true,
        view_payroll: true,
        view_billing: true, create_invoices: true, edit_invoices: true, record_receipts: true,
        view_finance: true, create_expenses: true,
        view_compliance: true,
        view_reports: true, export_reports: true,
        view_documents: true, upload_documents: true,
        view_audit_logs: true,
        send_notifications: true, view_notifications: true,
        view_dashboard: true,
      });
      break;
    case "manager":
      Object.assign(base, {
        // Starting position for a fresh install (Gaps #32, #33, #35, decided 12 Oct): a Manager works
        // on tasks; billing, payroll status and client / engagement edits stay with the partners.
        // The Managing Partner or Admin can switch any of these on in Settings, Roles & Permissions.
        view_clients: true,
        view_employees: true, view_own_employee: true,
        view_engagements: true,
        view_tasks: true, create_tasks: true, edit_tasks: true, review_tasks: true,
        view_compliance: true,
        view_reports: true,
        view_documents: true, upload_documents: true,
        view_notifications: true,
        view_dashboard: true,
      });
      break;
    case "paid_assistant":
      Object.assign(base, {
        view_clients: true,
        view_own_employee: true,
        view_engagements: true,
        view_tasks: true, edit_tasks: true,
        view_documents: true, upload_documents: true,
        view_notifications: true,
        view_dashboard: true,
      });
      break;
    case "articled_clerk":
      Object.assign(base, {
        view_clients: true,
        view_own_employee: true,
        view_engagements: true,
        view_tasks: true, edit_tasks: true,
        view_documents: true, upload_documents: true,
        view_notifications: true,
        view_dashboard: true,
      });
      break;
  }
  return base;
}

/**
 * Legacy roles written by migration 0037 that do not exist in the canonical
 * role set, and the canonical role their users are moved to.
 */
const LEGACY_ROLE_MAP: Record<string, SeededRoleName> = {
  senior_associate: "manager",
  associate: "paid_assistant",
};

const KNOWN_ACTIONS = new Set<string>(ALL_ACTIONS);

/**
 * Return a permissions object keyed by exactly ALL_ACTIONS.
 * `reset` replaces every value with the seeded default; otherwise existing
 * boolean values are kept and only missing keys fall back to the default.
 * Hard-locked actions are always false for every role but managing_partner.
 */
export function normalizePermissions(
  roleName: string,
  perms: Record<string, unknown> | null | undefined,
  reset: boolean,
): Record<string, boolean> {
  const defaults = getSeededPermissions(roleName);
  const current = perms ?? {};
  const out: Record<string, boolean> = {};
  for (const action of ALL_ACTIONS) {
    const value = current[action];
    out[action] = !reset && typeof value === "boolean" ? value : defaults[action];
  }
  if (roleName !== "managing_partner") {
    for (const action of HARD_LOCKED_ACTIONS) out[action] = false;
  }
  return out;
}

function parsePermissions(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return (raw as Record<string, unknown>) ?? {};
}

/**
 * Bring the roles table in line with the canonical matrix above:
 *  - creates any missing seeded role;
 *  - resets a seeded role to its defaults when it still carries keys outside
 *    ALL_ACTIONS (the signature of the broken 0037 seed: release_payroll,
 *    erasure, delete_tasks, ...) — once normalised, later edits are kept;
 *  - moves users off the legacy senior_associate / associate roles and drops them;
 *  - strips hard-locked actions from every role except managing_partner;
 *  - gives users that only carry the text `users.role` the matching role_id.
 * Idempotent and serialised with an advisory lock, so concurrent instances are safe.
 */
async function syncSeededRoles(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cma_pms_rbac_seed'))`);

    for (const name of SEEDED_ROLE_NAMES) {
      const existing = await client.query<{ id: string; permissions: unknown }>(
        `SELECT id, permissions FROM roles WHERE name = $1 LIMIT 1`,
        [name],
      );
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO roles (name, description, permissions, is_seeded, is_custom)
           VALUES ($1, $2, $3, true, false)`,
          [name, `Seeded role: ${name.replace(/_/g, " ")}`, JSON.stringify(getSeededPermissions(name))],
        );
      }
    }

    for (const [legacyName, targetName] of Object.entries(LEGACY_ROLE_MAP)) {
      const legacy = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE name = $1 LIMIT 1`,
        [legacyName],
      );
      if (legacy.rows.length === 0) continue;
      const legacyId = legacy.rows[0].id;
      await client.query(
        `UPDATE users SET role_id = (SELECT id FROM roles WHERE name = $2) WHERE role_id = $1`,
        [legacyId, targetName],
      );
      await client.query(`UPDATE roles SET cloned_from = NULL WHERE cloned_from = $1`, [legacyId]);
      await client.query(`DELETE FROM roles WHERE id = $1`, [legacyId]);
    }

    const roles = await client.query<{ id: string; name: string; permissions: unknown; is_seeded: boolean }>(
      `SELECT id, name, permissions, is_seeded FROM roles`,
    );
    for (const role of roles.rows) {
      const perms = parsePermissions(role.permissions);
      const isCanonical = (SEEDED_ROLE_NAMES as readonly string[]).includes(role.name);
      const hasForeignKeys = Object.keys(perms).some((k) => !KNOWN_ACTIONS.has(k));
      const normalised = normalizePermissions(role.name, perms, isCanonical && hasForeignKeys);
      const changed = Object.keys(perms).length !== ALL_ACTIONS.length
        || ALL_ACTIONS.some((a) => perms[a] !== normalised[a]);
      if (changed || (isCanonical && !role.is_seeded)) {
        await client.query(
          `UPDATE roles
              SET permissions = $2,
                  is_seeded = CASE WHEN $3 THEN true ELSE is_seeded END,
                  is_custom = CASE WHEN $3 THEN false ELSE is_custom END,
                  updated_at = now()
            WHERE id = $1`,
          [role.id, JSON.stringify(normalised), isCanonical],
        );
      }
    }

    await client.query(
      `UPDATE users u
          SET role_id = r.id
         FROM roles r
        WHERE u.role_id IS NULL
          AND r.name = u.role`,
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let rolesSynced: Promise<void> | null = null;

/**
 * Run syncSeededRoles once per server process (retried on the next call if it
 * fails), then make sure the master data seed has run.
 */
export async function ensureRolesSynced(): Promise<void> {
  if (isMockMode) return;
  if (!rolesSynced) {
    rolesSynced = syncSeededRoles().catch((err) => {
      rolesSynced = null;
      console.error("[rbac] role sync failed:", err);
    });
  }
  await rolesSynced;
  await ensureMasterDataSeeded();
  await ensureEmployeeChecklistsMigrated();
  await ensureTaskLibrariesSeeded();
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_seeded: boolean;
  is_custom: boolean;
  cloned_from: string | null;
  created_at: string;
  updated_at: string;
  hard_locked_actions?: string[];
}

/** Fetch user's role record from DB (joins users → roles). */
export async function getUserRole(userId: string): Promise<RoleWithPermissions | null> {
  await ensureRolesSynced();
  // A user still on an admin-issued one-time password has no permissions
  // until they set their own password (Gap #14).
  if ((await getPasswordChangeState(userId)).required) return null;
  const rows = await query<RoleWithPermissions>(
    `SELECT r.id, r.name, r.description, r.permissions,
            r.is_seeded, r.is_custom, r.cloned_from,
            r.created_at, r.updated_at
       FROM roles r
       JOIN users u ON u.role_id = r.id
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );
  if (rows.length === 0) return null;
  const role = rows[0];
  // Ensure permissions is an object
  if (typeof role.permissions === "string") {
    try { role.permissions = JSON.parse(role.permissions); } catch { role.permissions = {}; }
  }
  return role;
}

/** Check if user has a specific permission */
export async function userHasPermission(
  userId: string,
  action: ActionName,
): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  return role.permissions[action] === true;
}

/** Get the role name for a user (from users.role_id → roles.name, or fallback to users.role) */
export async function getUserRoleName(userId: string): Promise<string | null> {
  await ensureRolesSynced();
  if ((await getPasswordChangeState(userId)).required) return null;
  // Try role_id join first
  const rows = await query<{ role_name: string }>(
    `SELECT r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );
  if (rows.length > 0) return rows[0].role_name;

  // Fallback to the plain role column
  const fallback = await query<{ role: string }>(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return fallback.length > 0 ? fallback[0].role : null;
}

/**
 * Check if a user account is active. Deactivated accounts are treated as 401.
 */
async function assertUserActive(userId: string): Promise<void> {
  const rows = await query<{ is_active: boolean }>(
    `SELECT is_active FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (rows.length === 0 || rows[0].is_active === false) {
    throw { status: 401, message: "Account is deactivated" };
  }
  const passwordState = await getPasswordChangeState(userId);
  if (passwordState.required) {
    throw {
      status: 403,
      message: passwordState.expired
        ? "TEMP_PASSWORD_EXPIRED: your one-time password has expired — ask an administrator to issue a new one"
        : "PASSWORD_CHANGE_REQUIRED: set your own password before continuing",
    };
  }
}

/**
 * Require that the requesting user has one of the specified role names.
 * Throws 401 if not authenticated or deactivated, 403 if role doesn't match.
 */
export async function requireRole(
  req: NextRequest,
  ...allowedRoleNames: string[]
): Promise<SessionUser & { roleName: string }> {
  const user = await getSessionUser(req);
  if (!user) {
    throw { status: 401, message: "Not authenticated" };
  }
  await assertUserActive(user.id);
  const roleName = await getUserRoleName(user.id);
  if (!roleName) {
    throw { status: 403, message: "No role assigned" };
  }
  if (allowedRoleNames.length > 0 && !allowedRoleNames.includes(roleName)) {
    throw { status: 403, message: `Role '${roleName}' is not authorized for this action` };
  }
  return { ...user, roleName };
}

/**
 * Require that the requesting user has a specific action-level permission.
 * Throws 401 if not authenticated or deactivated, 403 if permission denied.
 */
export async function requirePermission(
  req: NextRequest,
  action: ActionName,
): Promise<SessionUser & { roleName: string }> {
  const user = await getSessionUser(req);
  if (!user) {
    throw { status: 401, message: "Not authenticated" };
  }
  await assertUserActive(user.id);
  const roleName = await getUserRoleName(user.id);
  if (!roleName) {
    throw { status: 403, message: "No role assigned" };
  }
  const has = await userHasPermission(user.id, action);
  if (!has) {
    throw { status: 403, message: `Permission '${action}' denied for role '${roleName}'` };
  }
  return { ...user, roleName };
}

/**
 * Utility: wrap route handler with standard error handling for RBAC errors
 */
export function handleRbacError(err: unknown): { status: number; body: { error: string } } {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  ) {
    const e = err as { status: number; message: string };
    return { status: e.status, body: { error: e.message } };
  }
  const message =
    err instanceof Error && err.message.trim()
      ? err.message
      : "Something went wrong. Please try again.";
  return { status: 500, body: { error: message } };
}
