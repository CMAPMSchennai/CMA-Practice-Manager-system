/**
 * Who may be assigned tasks (FR-42): a user linked to an active employee whose
 * onboarding checklist is complete (items overridden with justification count
 * as done). Shared by bulk assignment and partner reassignment (Gap #17).
 */
import { query } from "@/lib/db";

export type AssigneeCheck =
  | { ok: true; employeeId: string }
  | { ok: false; code: "ASSIGNEE_NOT_EMPLOYEE" | "ONBOARDING_INCOMPLETE"; message: string };

export async function checkAssigneeEligibility(userId: string): Promise<AssigneeCheck> {
  const rows = await query<{ employee_id: string | null; total: string; open: string }>(
    `SELECT e.id AS employee_id,
            COUNT(c.id)::text AS total,
            COUNT(c.id) FILTER (WHERE c.is_complete = false AND c.override_by IS NULL)::text AS open
       FROM users u
       LEFT JOIN employees e ON (e.id = u.employee_id OR e.user_id = u.id)
                            AND e.status NOT IN ('resigned', 'terminated')
       LEFT JOIN onboarding_checklist_items c
              ON c.owner_type = 'employee' AND c.owner_id = e.id
             AND c.checklist_item_code NOT LIKE 'legacy\\_%'
      WHERE u.id = $1 AND u.is_active = true
      GROUP BY e.id
      LIMIT 1`,
    [userId],
  );
  if (rows.length === 0 || !rows[0].employee_id) {
    return {
      ok: false,
      code: "ASSIGNEE_NOT_EMPLOYEE",
      message: "Tasks can only be assigned to an active user linked to a current employee record.",
    };
  }
  const total = parseInt(rows[0].total, 10);
  const open = parseInt(rows[0].open, 10);
  if (total === 0 || open > 0) {
    return {
      ok: false,
      code: "ONBOARDING_INCOMPLETE",
      message:
        total === 0
          ? "This employee has no onboarding checklist yet. Complete onboarding before assigning tasks."
          : `This employee has ${open} onboarding checklist item(s) outstanding. Complete onboarding before assigning tasks.`,
    };
  }
  return { ok: true, employeeId: rows[0].employee_id };
}

export interface EligibleAssignee {
  user_id: string;
  name: string;
  employee_id_code: string;
  position_type: string;
}

export interface BlockedAssignee {
  name: string;
  reason: string;
}

/**
 * Active users who can't be given tasks yet, and why — so the task panel can
 * explain an empty or short Doer list instead of leaving it a mystery (FR-42).
 */
export async function listBlockedAssignees(): Promise<BlockedAssignee[]> {
  const rows = await query<{ name: string; employee_id: string | null; total: string; open: string }>(
    `SELECT COALESCE(NULLIF(trim(u.name), ''), u.email) AS name,
            e.id AS employee_id,
            COUNT(c.id)::text AS total,
            COUNT(c.id) FILTER (WHERE c.is_complete = false AND c.override_by IS NULL)::text AS open
       FROM users u
       LEFT JOIN employees e ON (e.id = u.employee_id OR e.user_id = u.id)
                            AND e.status NOT IN ('resigned', 'terminated')
       LEFT JOIN onboarding_checklist_items c
              ON c.owner_type = 'employee' AND c.owner_id = e.id
             AND c.checklist_item_code NOT LIKE 'legacy\\_%'
      WHERE u.is_active = true
      GROUP BY u.id, u.name, u.email, e.id
      ORDER BY name ASC`,
  );
  const out: BlockedAssignee[] = [];
  for (const r of rows) {
    const total = parseInt(r.total, 10);
    const open = parseInt(r.open, 10);
    if (!r.employee_id) out.push({ name: r.name, reason: "not linked to an employee record" });
    else if (total === 0) out.push({ name: r.name, reason: "no onboarding checklist yet" });
    else if (open > 0) out.push({ name: r.name, reason: `${open} onboarding checklist item(s) not complete` });
  }
  return out;
}

export interface EligibleReviewer {
  user_id: string;
  name: string;
  role: string;
}

/** Active users whose role may review tasks (review_tasks), for reviewer pickers (FR-51). */
export async function listEligibleReviewers(): Promise<EligibleReviewer[]> {
  return query<EligibleReviewer>(
    `SELECT u.id AS user_id,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS name,
            r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = true
        AND r.permissions ->> 'review_tasks' = 'true'
      ORDER BY name ASC`,
  );
}

/** Everyone who can currently be assigned tasks, for assignee pickers. */
export async function listEligibleAssignees(): Promise<EligibleAssignee[]> {
  return query<EligibleAssignee>(
    `SELECT u.id AS user_id,
            trim(concat_ws(' ', e.first_name, e.last_name)) AS name,
            e.employee_id_code,
            e.position_type
       FROM users u
       JOIN employees e ON (e.id = u.employee_id OR e.user_id = u.id)
      WHERE u.is_active = true
        AND e.status NOT IN ('resigned', 'terminated')
        AND EXISTS (
              SELECT 1 FROM onboarding_checklist_items c
               WHERE c.owner_type = 'employee' AND c.owner_id = e.id
                 AND c.checklist_item_code NOT LIKE 'legacy\\_%')
        AND NOT EXISTS (
              SELECT 1 FROM onboarding_checklist_items c
               WHERE c.owner_type = 'employee' AND c.owner_id = e.id
                 AND c.checklist_item_code NOT LIKE 'legacy\\_%'
                 AND c.is_complete = false AND c.override_by IS NULL)
      ORDER BY e.first_name ASC, e.last_name ASC`,
  );
}
