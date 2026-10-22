/**
 * The "Today" start section (UI Version 3, added feature outside the PDF).
 * It only reads what the user may already see (FR-03): tasks, and statutory
 * filings for people with Compliance access. Doers see their own work;
 * everyone else sees all they have access to. The "next 14 days" list holds
 * tasks and filings together, overdue ones first.
 */
import { query } from "@/lib/db";
import { userHasPermission } from "@/lib/rbac";
import { clientVisibleSql, taskVisibleSql, type AccessScope } from "@/lib/access-scope";

export interface UpcomingItem {
  key: string;
  kind: "task" | "filing";
  title: string;
  client: string | null;
  due_date: string;
  days: number;
  owner: string | null;
  status_label: string;
  href: string;
}

export interface TodayNext {
  title: string;
  sub: string;
  label: string;
  href: string;
}

export interface Today {
  name: string;
  scope_label: "your" | "all";
  counts: {
    overdue: number;
    waiting: number;
    this_week: number;
    open: number;
    overdue_filings: number;
    week_filings: number;
  };
  next: TodayNext | null;
  has_filings: boolean;
  upcoming: UpcomingItem[];
}

const TASK_STATUS_WORDS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  under_review: "Under review",
  returned: "Returned",
  blocked: "Blocked",
};

const FILING_STATUS_WORDS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  overdue: "Overdue",
};

const HORIZON_DAYS = 14;

export async function buildToday(userId: string, scope: AccessScope): Promise<Today> {
  const doer = ["articled_clerk", "paid_assistant"].includes(scope.roleName ?? "");
  const conds: string[] = ["ti.status NOT IN ('completed', 'not_applicable')", "e.status <> 'cancelled'"];
  if (scope.mode !== "all" || scope.ownTasksOnly) conds.push(taskVisibleSql(scope, 1));
  if (doer) conds.push("(ti.assigned_to = $1::uuid OR ti.reviewer = $1::uuid)");

  const rows = await query<{
    id: string;
    engagement_id: string;
    engagement_code: string;
    client: string | null;
    title: string;
    status: string;
    due_date: string | null;
    days: number | null;
    assignee: string | null;
    i_review: boolean;
  }>(
    `SELECT ti.id, ti.engagement_id, e.engagement_code, c.name AS client, ti.title, ti.status,
            to_char(ti.due_date, 'YYYY-MM-DD') AS due_date,
            (ti.due_date - CURRENT_DATE)::int AS days,
            COALESCE(NULLIF(trim(au.name), ''), au.email) AS assignee,
            (ti.reviewer = $1::uuid) AS i_review
       FROM task_instances ti
       JOIN engagements e ON e.id = ti.engagement_id
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN users au ON au.id = ti.assigned_to
      WHERE ${conds.join(" AND ")}
      ORDER BY ti.due_date NULLS LAST, ti.sort_order
      LIMIT 500`,
    [userId],
  );

  const nameRows = await query<{ n: string | null }>(
    `SELECT COALESCE(NULLIF(trim(name), ''), email) AS n FROM users WHERE id = $1::uuid LIMIT 1`,
    [userId],
  );

  // Statutory filings, for people who can open the Compliance page.
  const hasFilings = await userHasPermission(userId, "view_compliance");
  let filings: UpcomingItem[] = [];
  if (hasFilings) {
    const fconds: string[] = [
      "sd.status NOT IN ('completed', 'not_applicable')",
      `sd.due_date <= CURRENT_DATE + ${HORIZON_DAYS}`,
      "sd.due_date >= CURRENT_DATE - 90",
    ];
    if (scope.mode !== "all") fconds.push(clientVisibleSql(scope, "sd.client_id", 1));
    if (doer) fconds.push("sd.owner_id = $1::uuid");
    const frows = await query<{
      id: string;
      obligation_name: string;
      period_label: string | null;
      due_date: string;
      days: number;
      status: string;
      client: string | null;
      owner: string | null;
    }>(
      `SELECT sd.id, sd.obligation_name, sd.period_label,
              to_char(sd.due_date, 'YYYY-MM-DD') AS due_date,
              (sd.due_date - CURRENT_DATE)::int AS days,
              sd.status, c.name AS client,
              COALESCE(NULLIF(trim(u.name), ''), u.email) AS owner
         FROM statutory_due_dates sd
         LEFT JOIN clients c ON c.id = sd.client_id
         LEFT JOIN users u ON u.id = sd.owner_id
        WHERE ${fconds.join(" AND ")}
        ORDER BY sd.due_date ASC
        LIMIT 300`,
      [userId],
    );
    filings = frows.map((f) => ({
      key: `f-${f.id}`,
      kind: "filing" as const,
      title: f.period_label ? `${f.obligation_name} (${f.period_label})` : f.obligation_name,
      client: f.client,
      due_date: f.due_date,
      days: f.days,
      owner: f.owner,
      status_label: FILING_STATUS_WORDS[f.status] ?? f.status,
      href: "/dashboard/compliance",
    }));
  }

  const taskItems: UpcomingItem[] = rows
    .filter((r) => r.days !== null && r.days <= HORIZON_DAYS && r.due_date)
    .map((r) => ({
      key: `t-${r.id}`,
      kind: "task" as const,
      title: r.title,
      client: r.client,
      due_date: r.due_date as string,
      days: r.days as number,
      owner: r.assignee,
      status_label: TASK_STATUS_WORDS[r.status] ?? r.status,
      href: `/dashboard/engagements/${r.engagement_id}?task=${r.id}`,
    }));

  const upcoming = [...taskItems, ...filings].sort((a, b) => a.days - b.days || a.title.localeCompare(b.title)).slice(0, 250);

  const isMp = scope.roleName === "managing_partner";
  const waitingRows = rows.filter((r) => r.status === "under_review" && (r.i_review || isMp));
  const overdue = rows.filter((r) => r.days !== null && r.days < 0);
  const thisWeek = rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 7);

  const link = (t: (typeof rows)[number]) => `/dashboard/engagements/${t.engagement_id}?task=${t.id}`;
  const who = (t: (typeof rows)[number]) => (t.client ? `${t.client} · ${t.engagement_code}` : t.engagement_code);

  let next: TodayNext | null = null;
  if (overdue.length > 0) {
    const t = overdue[0];
    next = {
      title: overdue.length === 1 ? "1 task is overdue" : `${overdue.length} tasks are overdue`,
      sub: `Start with "${t.title}" for ${who(t)}. Each overdue task needs a reason.`,
      label: "Open the task",
      href: link(t),
    };
  } else if (waitingRows.length > 0) {
    const r = waitingRows[0];
    next = {
      title: waitingRows.length === 1 ? "1 task is waiting for your review" : `${waitingRows.length} tasks are waiting for your review`,
      sub: "Check the work and approve it or send it back.",
      label: "Start reviewing",
      href: link(r),
    };
  } else if (rows.length > 0) {
    const t = rows.find((x) => x.days !== null) ?? rows[0];
    next = {
      title: `Next up: ${t.title}`,
      sub: `${who(t)}${t.due_date ? `, due ${t.due_date}` : ""}.`,
      label: "Open the task",
      href: link(t),
    };
  }

  return {
    name: nameRows[0]?.n ?? "",
    scope_label: doer ? "your" : "all",
    counts: {
      overdue: overdue.length,
      waiting: waitingRows.length,
      this_week: thisWeek.length,
      open: rows.length,
      overdue_filings: filings.filter((f) => f.days < 0).length,
      week_filings: filings.filter((f) => f.days >= 0 && f.days <= 7).length,
    },
    next,
    has_filings: hasFilings,
    upcoming,
  };
}
