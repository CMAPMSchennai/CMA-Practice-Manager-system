/**
 * Task board and task KPI tiles (FR-49, FR-53).
 *
 * The board groups tasks by engagement, each with its n/m done counter and
 * status. The tiles, for the chosen month:
 *   Tasks this month      due in the month, plus older tasks still open (Gap #20)
 *   Completed on time     of those, finished on or before their due date
 *   Overdue               every open task past its due date, and how many have a
 *                         delay reason logged
 *   Average turnaround    days from a task first being started to completion, for
 *                         tasks completed in the month, against the target in
 *                         Settings (Gap #64)
 * Everything respects what the user may see (FR-03). "Mine" narrows it to tasks
 * where the user is the doer or the reviewer.
 */
import { query } from "@/lib/db";
import { taskVisibleSql, type AccessScope } from "@/lib/access-scope";

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  assignee_name: string | null;
  reviewer_name: string | null;
  delay_reason: string | null;
  overdue: boolean;
}

export interface BoardEngagement {
  id: string;
  engagement_code: string;
  service: string | null;
  client: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  total: number;
  done: number;
  overdue: number;
  tasks: BoardTask[];
  more: number;
}

export interface BoardKpis {
  tasks_this_month: number;
  on_time: number;
  on_time_pct: number | null;
  overdue: number;
  overdue_with_reason: number;
  avg_turnaround_days: number | null;
  turnaround_sample: number;
  target_days: number;
}

const MAX_ENGAGEMENTS = 60;
const MAX_TASKS_PER_ENGAGEMENT = 150;

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

export async function buildTaskBoard(args: {
  month: string;
  mine: boolean;
  userId: string;
  scope: AccessScope;
  targetDays: number;
}): Promise<{ kpis: BoardKpis; engagements: BoardEngagement[] }> {
  const { start, end } = monthBounds(args.month);

  // Shared filter: only tasks the user may see, optionally only their own.
  const params: unknown[] = [];
  const conds: string[] = ["ti.status <> 'not_applicable'", "e.status <> 'cancelled'"];
  if (args.scope.mode !== "all" || args.scope.ownTasksOnly) {
    params.push(args.userId);
    conds.push(taskVisibleSql(args.scope, params.length));
  }
  if (args.mine) {
    params.push(args.userId);
    conds.push(`(ti.assigned_to = $${params.length}::uuid OR ti.reviewer = $${params.length}::uuid)`);
  }
  const where = conds.join(" AND ");
  const monthParams = (base: unknown[]) => {
    const p = [...base, start, end];
    return { p, m1: `$${p.length - 1}`, m2: `$${p.length}` };
  };

  /* ---- tiles ---- */
  const k = monthParams(params);
  const kpiRows = await query<Record<string, string>>(
    `WITH t AS (
       SELECT ti.status, ti.due_date, ti.completed_at,
              (ti.due_date >= ${k.m1}::date AND ti.due_date < ${k.m2}::date) AS due_in_month,
              (ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < ${k.m1}::date) AS older_open,
              (ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE) AS overdue,
              EXISTS (SELECT 1 FROM delay_reason_dispositions d WHERE d.task_instance_id = ti.id) AS has_reason
         FROM task_instances ti JOIN engagements e ON e.id = ti.engagement_id
        WHERE ${where}
     )
     SELECT COUNT(*) FILTER (WHERE due_in_month OR older_open) AS this_month,
            COUNT(*) FILTER (WHERE due_in_month AND status = 'completed' AND completed_at::date <= due_date) AS on_time,
            COUNT(*) FILTER (WHERE overdue) AS overdue,
            COUNT(*) FILTER (WHERE overdue AND has_reason) AS overdue_with_reason
       FROM t`,
    k.p,
  );
  const ta = monthParams(params);
  const turn = await query<{ n: string; avg_days: string | null }>(
    `SELECT COUNT(*)::text AS n,
            AVG(EXTRACT(EPOCH FROM (ti.completed_at - COALESCE(s.started, ti.created_at))) / 86400.0)::text AS avg_days
       FROM task_instances ti
       JOIN engagements e ON e.id = ti.engagement_id
       LEFT JOIN LATERAL (
         SELECT MIN(a.created_at) AS started FROM audit_logs a
          WHERE a.entity_type = 'task_instance' AND a.entity_id = ti.id
            AND a.field_changes -> 'status' ->> 'after' = 'in_progress'
       ) s ON true
      WHERE ${where} AND ti.status = 'completed'
        AND ti.completed_at >= ${ta.m1}::date AND ti.completed_at < ${ta.m2}::date`,
    ta.p,
  );
  const kr = kpiRows[0] ?? {};
  const thisMonth = Number(kr.this_month ?? 0);
  const onTime = Number(kr.on_time ?? 0);
  const avg = turn[0]?.avg_days != null ? Math.round(Number(turn[0].avg_days) * 10) / 10 : null;
  const kpis: BoardKpis = {
    tasks_this_month: thisMonth,
    on_time: onTime,
    on_time_pct: thisMonth > 0 ? Math.round((onTime / thisMonth) * 1000) / 10 : null,
    overdue: Number(kr.overdue ?? 0),
    overdue_with_reason: Number(kr.overdue_with_reason ?? 0),
    avg_turnaround_days: avg,
    turnaround_sample: Number(turn[0]?.n ?? 0),
    target_days: args.targetDays,
  };

  /* ---- board ---- */
  const engs = await query<{
    id: string;
    engagement_code: string;
    service: string | null;
    client: string | null;
    period_start: string | null;
    period_end: string | null;
    status: string;
    total: string;
    done: string;
    overdue: string;
  }>(
    `SELECT e.id, e.engagement_code, st.name AS service, c.name AS client, e.period_start, e.period_end, e.status,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE ti.status = 'completed')::text AS done,
            COUNT(*) FILTER (WHERE ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE)::text AS overdue
       FROM task_instances ti
       JOIN engagements e ON e.id = ti.engagement_id
       JOIN clients c ON c.id = e.client_id
       JOIN service_types st ON st.id = e.service_type_id
      WHERE ${where}
      GROUP BY e.id, st.name, c.name
      ORDER BY COUNT(*) FILTER (WHERE ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE) DESC,
               e.engagement_code DESC
      LIMIT ${MAX_ENGAGEMENTS}`,
    params,
  );
  if (engs.length === 0) return { kpis, engagements: [] };

  const b = monthParams(params);
  b.p.push(engs.map((e) => e.id));
  const idsParam = `$${b.p.length}`;
  const tasks = await query<{
    id: string;
    engagement_id: string;
    title: string;
    status: string;
    due_date: string | null;
    completed_at: string | null;
    assignee_name: string | null;
    reviewer_name: string | null;
    delay_reason: string | null;
    overdue: boolean;
  }>(
    `SELECT ti.id, ti.engagement_id, ti.title, ti.status, ti.due_date, ti.completed_at,
            COALESCE(NULLIF(trim(au.name), ''), au.email) AS assignee_name,
            COALESCE(NULLIF(trim(ru.name), ''), ru.email) AS reviewer_name,
            (SELECT rd.label FROM delay_reason_dispositions d JOIN reference_data rd ON rd.id = d.reason_id
              WHERE d.task_instance_id = ti.id ORDER BY d.logged_at DESC LIMIT 1) AS delay_reason,
            (ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE) AS overdue
       FROM task_instances ti
       JOIN engagements e ON e.id = ti.engagement_id
       LEFT JOIN users au ON au.id = ti.assigned_to
       LEFT JOIN users ru ON ru.id = ti.reviewer
      WHERE ${where} AND ti.engagement_id = ANY(${idsParam}::uuid[])
        AND (ti.status <> 'completed' OR (ti.completed_at >= ${b.m1}::date AND ti.completed_at < ${b.m2}::date))
      ORDER BY (ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE) DESC,
               ti.due_date NULLS LAST, ti.sort_order`,
    b.p,
  );

  const byEng = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const list = byEng.get(t.engagement_id) ?? [];
    list.push({
      id: t.id,
      title: t.title,
      status: t.status,
      due_date: t.due_date,
      completed_at: t.completed_at,
      assignee_name: t.assignee_name,
      reviewer_name: t.reviewer_name,
      delay_reason: t.delay_reason,
      overdue: t.overdue,
    });
    byEng.set(t.engagement_id, list);
  }

  return {
    kpis,
    engagements: engs.map((e) => {
      const list = byEng.get(e.id) ?? [];
      return {
        id: e.id,
        engagement_code: e.engagement_code,
        service: e.service,
        client: e.client,
        period_start: e.period_start,
        period_end: e.period_end,
        status: e.status,
        total: Number(e.total),
        done: Number(e.done),
        overdue: Number(e.overdue),
        tasks: list.slice(0, MAX_TASKS_PER_ENGAGEMENT),
        more: Math.max(0, list.length - MAX_TASKS_PER_ENGAGEMENT),
      };
    }),
  };
}
