/**
 * Record-level visibility (FR-03, NFR-07, AC-10; Gaps #25 and #26).
 *
 *   all      — Managing Partner and Admin: every client (Gap #26).
 *   partner  — clients where they are partner-in-charge, plus clients on any
 *              engagement they lead, are on the team of, or hold a task on (Gap #25).
 *   assigned — everyone else: only clients / engagements they are assigned to
 *              (engagement team, or assignee / reviewer of one of its tasks).
 * Articled clerks additionally see only their own tasks within those engagements
 * (§4: "restricted to explicitly assigned sub-tasks").
 *
 * The SQL helpers return a boolean expression that uses one bind parameter
 * (the user's id) at the index the caller passes in.
 */
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";

export type ScopeMode = "all" | "partner" | "assigned";

export interface AccessScope {
  userId: string;
  roleName: string | null;
  mode: ScopeMode;
  ownTasksOnly: boolean;
}

const FULL_ACCESS_ROLES = new Set(["managing_partner", "admin"]);

export async function getAccessScope(userId: string, roleName?: string | null): Promise<AccessScope> {
  const role = roleName === undefined ? await getUserRoleName(userId) : roleName;
  const mode: ScopeMode = role && FULL_ACCESS_ROLES.has(role) ? "all" : role === "partner" ? "partner" : "assigned";
  return { userId, roleName: role ?? null, mode, ownTasksOnly: role === "articled_clerk" };
}

/** Engagements the user works on: on the team, or assignee / reviewer of a task. */
function assignedEngagementsSql(p: string): string {
  return `SELECT et.engagement_id FROM engagement_team et WHERE et.user_id = ${p}
          UNION
          SELECT ti.engagement_id FROM task_instances ti WHERE ti.assigned_to = ${p} OR ti.reviewer = ${p}`;
}

/** Boolean SQL: is the client in column `clientCol` visible to the user bound at $paramIndex? */
export function clientVisibleSql(scope: AccessScope, clientCol: string, paramIndex: number): string {
  if (scope.mode === "all") return "TRUE";
  const p = `$${paramIndex}::uuid`;
  const viaEngagements = `SELECT e.client_id FROM engagements e WHERE e.id IN (${assignedEngagementsSql(p)})`;
  if (scope.mode === "partner") {
    return `(${clientCol} IN (
              SELECT c.id FROM clients c WHERE c.partner_in_charge_id = ${p}
              UNION SELECT e.client_id FROM engagements e WHERE e.partner_in_charge_id = ${p}
              UNION ${viaEngagements}))`;
  }
  return `(${clientCol} IN (${viaEngagements}))`;
}

/** Boolean SQL: is the engagement in column `engagementCol` visible to the user? */
export function engagementVisibleSql(scope: AccessScope, engagementCol: string, paramIndex: number): string {
  if (scope.mode === "all") return "TRUE";
  const p = `$${paramIndex}::uuid`;
  if (scope.mode === "partner") {
    return `(${engagementCol} IN (
              SELECT e.id FROM engagements e
                LEFT JOIN clients c ON c.id = e.client_id
               WHERE e.partner_in_charge_id = ${p} OR c.partner_in_charge_id = ${p}
              UNION ${assignedEngagementsSql(p)}))`;
  }
  return `(${engagementCol} IN (${assignedEngagementsSql(p)}))`;
}

/**
 * Boolean SQL for a task row aliased `ti`: engagement visible, and for articled
 * clerks only tasks they are assignee or reviewer of.
 */
export function taskVisibleSql(scope: AccessScope, paramIndex: number): string {
  const engagement = engagementVisibleSql(scope, "ti.engagement_id", paramIndex);
  if (!scope.ownTasksOnly) return engagement;
  const p = `$${paramIndex}::uuid`;
  return `(${engagement} AND (ti.assigned_to = ${p} OR ti.reviewer = ${p}))`;
}

export async function canSeeClient(scope: AccessScope, clientId: string): Promise<boolean> {
  if (scope.mode === "all") return true;
  const rows = await query<{ ok: boolean }>(
    `SELECT ${clientVisibleSql(scope, "$2::uuid", 1)} AS ok`,
    [scope.userId, clientId],
  );
  return rows[0]?.ok === true;
}

export async function canSeeEngagement(scope: AccessScope, engagementId: string): Promise<boolean> {
  if (scope.mode === "all") return true;
  const rows = await query<{ ok: boolean }>(
    `SELECT ${engagementVisibleSql(scope, "$2::uuid", 1)} AS ok`,
    [scope.userId, engagementId],
  );
  return rows[0]?.ok === true;
}

/**
 * Document owners (NFR-07): client docs follow client scope, engagement docs
 * follow engagement scope, employee docs are visible to the employee themself
 * or to users who can view employees.
 */
export async function canSeeDocumentOwner(
  scope: AccessScope,
  ownerType: string,
  ownerId: string,
  canViewEmployees: boolean,
): Promise<boolean> {
  // Gap #63 (decided 12 Oct): firm documents (peer review certificate, DSC) are for the
  // Managing Partner only. Checked before the "all" shortcut so Admin does not get them.
  if (ownerType === "entity") return scope.roleName === "managing_partner";
  if (scope.mode === "all") return true;
  if (ownerType === "client") return canSeeClient(scope, ownerId);
  if (ownerType === "engagement") return canSeeEngagement(scope, ownerId);
  if (ownerType === "employee") {
    // Gap #34 (decided 12 Oct): ID and bank scans of staff are for the Managing Partner,
    // Partners and Admin, and for the employee themself.
    if (scope.roleName && ["managing_partner", "partner", "admin"].includes(scope.roleName)) return true;
    void canViewEmployees;
    const rows = await query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM employees e
           LEFT JOIN users u ON u.employee_id = e.id
          WHERE e.id = $2::uuid AND (e.user_id = $1::uuid OR u.id = $1::uuid)
       ) AS ok`,
      [scope.userId, ownerId],
    );
    return rows[0]?.ok === true;
  }
  return false;
}

export async function canSeeTask(scope: AccessScope, taskId: string): Promise<boolean> {
  if (scope.mode === "all") return true;
  const rows = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM task_instances ti WHERE ti.id = $2::uuid AND ${taskVisibleSql(scope, 1)}) AS ok`,
    [scope.userId, taskId],
  );
  return rows[0]?.ok === true;
}
