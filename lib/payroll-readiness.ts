/**
 * Payroll readiness engine (FR-14, FR-15, FR-57, FR-60, FR-61).
 *
 * Tasks in a month (Gap #20, #73): tasks due in the month, plus older tasks still open, plus older
 * tasks finished during the month (so finishing a late task never lowers the percentage).
 *
 * Per task:
 *   done      — status completed / not_applicable
 *   open      — not yet due and not done (neither blocking nor clear)
 *   overdue   — past due and not done, classified by its latest delay reason:
 *                 no reason logged                   → blocking            (Gap #21)
 *                 partner accepted / escalated       → accepted (clear)    (FR-60, Gap #18)
 *                 partner counselled                 → blocking            (FR-60)
 *                 awaiting partner, neutral reason   → pending acceptance  (FR-13, Gap #21)
 *                 awaiting partner, any other reason → blocking            (FR-13, Gap #21)
 * Handover items (DR-06, logged against the original assignee on Reassign, Gap #17)
 * block that employee until the partner approves the handover (FR-56).
 *
 * Salary status (FR-14, thresholds per entity):
 *   Ready         — every task done or accepted, nothing blocking or pending
 *   On hold       — blocking items ≥ on_hold_min (3) or completion < on_hold_below_pct (50%),
 *                   where tasks the partner accepted count as finished (Gap #73)
 *   Review needed — anything else (1–2 blocking items, or work still open / pending acceptance)
 * Released records are locked and never recomputed (FR-61).
 */
import { query } from "@/lib/db";
import { readEmployeeSalaries } from "@/lib/secure-fields";

const HANDOVER_REASON_CODE = "DR-06";
const DONE_STATUSES = new Set(["completed", "not_applicable"]);

export interface Thresholds {
  onHoldMinBlocking: number;
  onHoldBelowCompletion: number;
}

export interface EmployeeReadiness {
  employee_id: string;
  user_id: string | null;
  tasks_assigned: number;
  tasks_done: number;
  tasks_overdue: number;
  on_time_count: number;
  completion_pct: number;
  blocking_items: number;
  pending_acceptance: number;
  salary_status: "ready" | "review_needed" | "on_hold";
  gross_amount: number | null;
}

export function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${period}-01`, end: `${next}-01` };
}

export function currentPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function loadThresholds(entityId: string): Promise<Thresholds> {
  const rows = await query<{ min_task_completion_pct: string | number; config: Record<string, unknown> | null }>(
    `SELECT min_task_completion_pct, config
       FROM payroll_readiness_thresholds
      WHERE entity_id = $1
      LIMIT 1`,
    [entityId],
  );
  const cfg = rows[0]?.config ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    onHoldMinBlocking: num(cfg.on_hold_min_blocking_items, 3),
    onHoldBelowCompletion: num(
      cfg.on_hold_below_completion_pct,
      num(rows[0]?.min_task_completion_pct, 0.5),
    ),
  };
}

/** Evaluate readiness for an entity's active employees for a month. No writes. */
export async function evaluateReadiness(
  period: string,
  entityId: string,
  employeeIds?: string[],
): Promise<EmployeeReadiness[]> {
  const { start, end } = periodBounds(period);
  const thresholds = await loadThresholds(entityId);

  const employees = await query<{ id: string; user_id: string | null; salary: string | number | null }>(
    `SELECT e.id, COALESCE(e.user_id, u.id) AS user_id, e.salary
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
      WHERE e.payroll_entity_id = $1
        AND e.status = 'active'
        AND ($2::uuid[] IS NULL OR e.id = ANY($2::uuid[]))`,
    [entityId, employeeIds && employeeIds.length > 0 ? employeeIds : null],
  );
  const userIds = employees.map((e) => e.user_id).filter((u): u is string => !!u);
  // Salaries are stored encrypted (NFR); decrypt for the FR-57 amount column.
  const salaries = await readEmployeeSalaries(
    employees.map((e) => e.id),
    new Map(employees.map((e) => [e.id, e.salary])),
  );

  const tasks = userIds.length
    ? await query<{
        id: string;
        assigned_to: string;
        status: string;
        due_date: string;
        completed_at: string | null;
      }>(
        `SELECT id, assigned_to, status, due_date::text AS due_date, completed_at
           FROM task_instances
          WHERE assigned_to = ANY($1::uuid[])
            AND due_date IS NOT NULL
            AND (
                  (due_date >= $2::date AND due_date < $3::date)
               OR (due_date < $2::date AND status NOT IN ('completed', 'not_applicable'))
               OR (due_date < $2::date AND status = 'completed'
                   AND completed_at >= $2::date AND completed_at < $3::date)
            )`,
        [userIds, start, end],
      )
    : [];

  const taskIds = tasks.map((t) => t.id);
  const latestReasons = taskIds.length
    ? await query<{ task_instance_id: string; disposition_action: string | null; impact: string | null }>(
        `SELECT DISTINCT ON (d.task_instance_id)
                d.task_instance_id, d.disposition_action,
                rd.metadata ->> 'default_payroll_impact' AS impact
           FROM delay_reason_dispositions d
           JOIN reference_data rd ON rd.id = d.reason_id
          WHERE d.task_instance_id = ANY($1::uuid[])
            AND rd.code IS DISTINCT FROM $2
          ORDER BY d.task_instance_id, d.logged_at DESC`,
        [taskIds, HANDOVER_REASON_CODE],
      )
    : [];
  const reasonByTask = new Map(latestReasons.map((r) => [r.task_instance_id, r]));

  // Handover items still holding the original assignee (FR-56, Gap #17).
  const handovers = userIds.length
    ? await query<{ logged_by: string; n: string }>(
        `SELECT d.logged_by, COUNT(*)::text AS n
           FROM delay_reason_dispositions d
           JOIN reference_data rd ON rd.id = d.reason_id
          WHERE rd.code = $1
            AND d.logged_by = ANY($2::uuid[])
            AND d.logged_at < $4::date
            AND (
                  d.disposition_action IS NULL
               OR (d.disposition_action = 'counsel'
                   AND d.dispositioned_at >= $3::date AND d.dispositioned_at < $4::date)
            )
          GROUP BY d.logged_by`,
        [HANDOVER_REASON_CODE, userIds, start, end],
      )
    : [];
  const handoverByUser = new Map(handovers.map((h) => [h.logged_by, parseInt(h.n, 10)]));

  const today = new Date().toISOString().slice(0, 10);

  return employees.map((emp) => {
    const own = emp.user_id ? tasks.filter((t) => t.assigned_to === emp.user_id) : [];
    let done = 0;
    let onTime = 0;
    let overdue = 0;
    let accepted = 0;
    let blocking = 0;
    let pending = 0;

    for (const t of own) {
      if (DONE_STATUSES.has(t.status)) {
        done++;
        if (t.status === "completed" && t.completed_at && t.completed_at.slice(0, 10) <= t.due_date) {
          onTime++;
        }
        continue;
      }
      if (t.due_date >= today) continue; // not yet due
      overdue++;
      const reason = reasonByTask.get(t.id);
      if (!reason) {
        blocking++;
      } else if (reason.disposition_action === "accept" || reason.disposition_action === "escalate") {
        accepted++;
      } else if (reason.disposition_action === null && reason.impact === "neutral") {
        pending++;
      } else {
        blocking++;
      }
    }
    blocking += emp.user_id ? handoverByUser.get(emp.user_id) ?? 0 : 0;

    const total = own.length;
    // Gap #73: a delay the partner has accepted is payroll-neutral (FR-13, FR-60), so it counts as
    // finished when deciding On hold, and the stored completion shows the same credited figure so
    // a Ready clerk never reads 0%. Done / Assigned still counts finished tasks only.
    const creditedCompletion = total === 0 ? 1 : (done + accepted) / total;
    const allClear = blocking === 0 && pending === 0 && done + accepted === total;

    let status: EmployeeReadiness["salary_status"];
    if (allClear) status = "ready";
    else if (blocking >= thresholds.onHoldMinBlocking || creditedCompletion < thresholds.onHoldBelowCompletion) {
      status = "on_hold";
    } else status = "review_needed";

    return {
      employee_id: emp.id,
      user_id: emp.user_id,
      tasks_assigned: total,
      tasks_done: done,
      tasks_overdue: overdue,
      on_time_count: onTime,
      completion_pct: Math.round(creditedCompletion * 10000) / 10000,
      blocking_items: blocking,
      pending_acceptance: pending,
      salary_status: status,
      gross_amount: salaries.get(emp.id) ?? null,
    };
  });
}

/** Evaluate and store readiness. Released records are left untouched (FR-61). */
export async function computeAndStoreReadiness(
  period: string,
  entityId: string,
  employeeIds?: string[],
): Promise<EmployeeReadiness[]> {
  const results = await evaluateReadiness(period, entityId, employeeIds);
  const { start } = periodBounds(period);
  for (const r of results) {
    await query(
      `INSERT INTO payroll_readiness
         (employee_id, payroll_entity_id, period, task_completion_pct, open_blocking_items, salary_status)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       ON CONFLICT (employee_id, payroll_entity_id, period)
       DO UPDATE SET
         task_completion_pct = EXCLUDED.task_completion_pct,
         open_blocking_items = EXCLUDED.open_blocking_items,
         salary_status = EXCLUDED.salary_status,
         updated_at = now()
       WHERE payroll_readiness.salary_status <> 'released'`,
      [r.employee_id, entityId, start, r.completion_pct, r.blocking_items, r.salary_status],
    );
  }
  return results;
}

/**
 * Recompute readiness for the employees behind these users, for the given
 * months (FR-60: status updates as soon as the partner acts).
 */
export async function recomputeForUsers(userIds: (string | null | undefined)[], periods: string[]): Promise<void> {
  const ids = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  if (ids.length === 0) return;
  const employees = await query<{ id: string; payroll_entity_id: string }>(
    `SELECT DISTINCT e.id, e.payroll_entity_id
       FROM employees e
       LEFT JOIN users u ON u.employee_id = e.id
      WHERE e.status = 'active'
        AND (e.user_id = ANY($1::uuid[]) OR u.id = ANY($1::uuid[]))`,
    [ids],
  );
  const byEntity = new Map<string, string[]>();
  for (const e of employees) {
    byEntity.set(e.payroll_entity_id, [...(byEntity.get(e.payroll_entity_id) ?? []), e.id]);
  }
  for (const period of Array.from(new Set(periods))) {
    for (const [entityId, empIds] of Array.from(byEntity.entries())) {
      await computeAndStoreReadiness(period, entityId, empIds);
    }
  }
}
