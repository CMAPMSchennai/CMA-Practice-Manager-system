/**
 * Managing Partner dashboard figures for one month (FR-16 to FR-23).
 *
 * Basis (Gap #50): income is what was invoiced in the month, before GST and
 * before reimbursements, split by service line; expenses are the month's
 * expense entries by category (DM-12, DM-15). Net profit = income - expenses.
 * Cash comes from receipts and expenses over the entities' opening balances.
 * Finance sections are only built for roles with Finance access (FR-04, §4).
 */
import { query } from "@/lib/db";
import { evaluateReadiness, periodBounds } from "@/lib/payroll-readiness";
import { taskVisibleSql, type AccessScope } from "@/lib/access-scope";

const BILLED_STATUSES = ["issued", "sent", "partially_paid", "paid", "overdue"];
const OPEN_INVOICE_STATUSES = ["issued", "sent", "partially_paid", "overdue"];

export interface Line {
  name: string;
  amount: number;
}

export interface FinanceSection {
  income: number;
  expenses: number;
  net_profit: number;
  prev_net_profit: number;
  mom_pct: number | null;
  margin_pct: number | null;
  invoice_count: number;
  collected: number;
  realisation_pct: number | null;
  revenue_lines: Line[];
  expense_lines: Line[];
  cash: {
    opening: number;
    collections: number;
    salaries: number;
    operating: number;
    statutory: number;
    closing: number;
    net_inflow: number;
  };
  receivables: {
    total: number;
    overdue_60: number;
    overdue_60_clients: number;
    invoices_open: number;
  };
}

export interface TeamRow {
  employee_id: string;
  name: string;
  role: string;
  tasks_done: number;
  tasks_assigned: number;
  completion_pct: number;
  salary_status: "ready" | "review_needed" | "on_hold";
  blocking_items: number;
}

export interface TaskRow {
  id: string;
  engagement_id: string;
  engagement_code: string | null;
  title: string;
  area: string | null;
  client: string | null;
  assignee: string;
  due_date: string;
  days_late: number;
  reason: string | null;
  partner_action: string | null;
  blocking: boolean;
}

export interface Overview {
  period: string;
  utilisation: {
    pct: number;
    staff_count: number;
    tasks_closed: number;
    tasks_total: number;
  };
  finance: FinanceSection | null;
  team: {
    ready: number;
    review_needed: number;
    on_hold: number;
    rows: TeamRow[];
  } | null;
  tasks_not_completed: {
    total: number;
    blocking: number;
    rows: TaskRow[];
  } | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Month income split by service line, scaled so the lines add up to the invoices' value. */
async function monthIncome(start: string, end: string): Promise<{ total: number; lines: Line[]; count: number }> {
  const rows = await query<{ invoice_id: string; subtotal: number; alloc: number | null; line: string | null }>(
    `SELECT i.id AS invoice_id, i.subtotal::float8 AS subtotal, ie.amount::float8 AS alloc,
            CASE WHEN st.description LIKE 'Category: %' THEN substr(st.description, 11) ELSE st.name END AS line
       FROM invoices i
       LEFT JOIN invoice_engagements ie ON ie.invoice_id = i.id
       LEFT JOIN engagements e ON e.id = ie.engagement_id
       LEFT JOIN service_types st ON st.id = e.service_type_id
      WHERE i.status = ANY($1::text[]) AND i.invoice_date >= $2::date AND i.invoice_date < $3::date`,
    [BILLED_STATUSES, start, end],
  );

  const byInvoice = new Map<string, { subtotal: number; parts: { line: string; alloc: number }[] }>();
  for (const r of rows) {
    const entry = byInvoice.get(r.invoice_id) ?? { subtotal: Number(r.subtotal) || 0, parts: [] };
    entry.parts.push({ line: r.line ?? "Unallocated", alloc: Number(r.alloc) || 0 });
    byInvoice.set(r.invoice_id, entry);
  }

  const totals = new Map<string, number>();
  let total = 0;
  for (const inv of Array.from(byInvoice.values())) {
    total += inv.subtotal;
    const sum = inv.parts.reduce((s, p) => s + p.alloc, 0);
    for (const p of inv.parts) {
      const share = sum > 0 ? (p.alloc / sum) * inv.subtotal : inv.subtotal / inv.parts.length;
      totals.set(p.line, (totals.get(p.line) ?? 0) + share);
    }
  }
  const lines = Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount: round2(amount) }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  return { total: round2(total), lines, count: byInvoice.size };
}

async function monthExpenses(start: string, end: string): Promise<Line[]> {
  const rows = await query<{ category: string; total: number }>(
    `SELECT COALESCE(NULLIF(trim(category), ''), 'Other') AS category, SUM(amount)::float8 AS total
       FROM expenses
      WHERE expense_date >= $1::date AND expense_date < $2::date
      GROUP BY 1
      ORDER BY 2 DESC`,
    [start, end],
  );
  return rows.map((r) => ({ name: r.category, amount: round2(Number(r.total) || 0) }));
}

const sum = (lines: Line[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

async function buildFinance(period: string): Promise<FinanceSection> {
  const { start, end } = periodBounds(period);
  const prev = periodBounds(previousPeriod(period));

  const [income, expenseLines, prevIncome, prevExpenseLines] = await Promise.all([
    monthIncome(start, end),
    monthExpenses(start, end),
    monthIncome(prev.start, prev.end),
    monthExpenses(prev.start, prev.end),
  ]);
  const expenses = sum(expenseLines);
  const net = round2(income.total - expenses);
  const prevNet = round2(prevIncome.total - sum(prevExpenseLines));
  const mom = prevNet !== 0 ? round2(((net - prevNet) / Math.abs(prevNet)) * 100) : null;
  const margin = income.total > 0 ? round2((net / income.total) * 100) : null;

  const one = async (sql: string, params: unknown[]) =>
    Number((await query<{ v: number | null }>(sql, params))[0]?.v ?? 0) || 0;

  const collected = await one(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS v FROM receipts
      WHERE receipt_date >= $1::date AND receipt_date < $2::date`,
    [start, end],
  );
  // Realisation compares like with like (Gap #76): income is before GST, so each receipt
  // is scaled down by its invoice's subtotal / total before it is set against income.
  const collectedNet = await one(
    `SELECT COALESCE(SUM(r.amount * COALESCE(i.subtotal / NULLIF(i.total_amount, 0), 1)), 0)::float8 AS v
       FROM receipts r LEFT JOIN invoices i ON i.id = r.invoice_id
      WHERE r.receipt_date >= $1::date AND r.receipt_date < $2::date`,
    [start, end],
  );
  const openingBalances = await one(
    `SELECT COALESCE(SUM(opening_balance), 0)::float8 AS v FROM bank_accounts WHERE is_active = true`,
    [],
  );
  const receiptsBefore = await one(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS v FROM receipts WHERE receipt_date < $1::date`,
    [start],
  );
  const expensesBefore = await one(
    `SELECT COALESCE(SUM(amount), 0)::float8 AS v FROM expenses WHERE expense_date < $1::date`,
    [start],
  );

  const salaries = sum(expenseLines.filter((l) => /salar/i.test(l.name)));
  const statutory = sum(expenseLines.filter((l) => /statutory/i.test(l.name)));
  const operating = round2(expenses - salaries - statutory);
  const opening = round2(openingBalances + receiptsBefore - expensesBefore);
  const closing = round2(opening + collected - expenses);

  // Receivables as on the last day of the month (or today, for the current month).
  const open = await query<{ client_id: string; total: number; settled: number; due: string; as_on: string }>(
    `WITH asof AS (SELECT LEAST($1::date - 1, CURRENT_DATE) AS d)
     SELECT i.client_id, i.total_amount::float8 AS total,
            (SELECT COALESCE(SUM(r.amount + COALESCE(r.tds_amount, 0)), 0)::float8
               FROM receipts r WHERE r.invoice_id = i.id AND r.receipt_date <= (SELECT d FROM asof)) AS settled,
            to_char(COALESCE(i.due_date, i.invoice_date), 'YYYY-MM-DD') AS due,
            to_char((SELECT d FROM asof), 'YYYY-MM-DD') AS as_on
       FROM invoices i
      WHERE i.status = ANY($2::text[]) AND i.invoice_date <= (SELECT d FROM asof)`,
    [end, OPEN_INVOICE_STATUSES],
  );
  let arTotal = 0;
  let arOverdue = 0;
  let openCount = 0;
  const overdueClients = new Set<string>();
  for (const r of open) {
    const outstanding = round2((Number(r.total) || 0) - (Number(r.settled) || 0));
    if (outstanding <= 0) continue;
    arTotal += outstanding;
    openCount++;
    const days = Math.round((Date.parse(r.as_on) - Date.parse(r.due)) / 86_400_000);
    if (days > 60) {
      arOverdue += outstanding;
      overdueClients.add(r.client_id);
    }
  }

  return {
    income: income.total,
    expenses,
    net_profit: net,
    prev_net_profit: prevNet,
    mom_pct: mom,
    margin_pct: margin,
    invoice_count: income.count,
    collected: round2(collected),
    realisation_pct: income.total > 0 ? round2((collectedNet / income.total) * 100) : null,
    revenue_lines: income.lines,
    expense_lines: expenseLines,
    cash: {
      opening,
      collections: round2(collected),
      salaries,
      operating,
      statutory,
      closing,
      net_inflow: round2(closing - opening),
    },
    receivables: {
      total: round2(arTotal),
      overdue_60: round2(arOverdue),
      overdue_60_clients: overdueClients.size,
      invoices_open: openCount,
    },
  };
}

const POSITION_WORDS: Record<string, string> = {
  partner: "Partner",
  paid_assistant: "Paid Assistant",
  articled_clerk: "Articled Clerk",
  support_staff: "Support Staff",
};

const STATUS_ORDER: Record<string, number> = { on_hold: 0, review_needed: 1, ready: 2 };

async function buildTeam(period: string): Promise<NonNullable<Overview["team"]>> {
  const entities = await query<{ id: string }>(`SELECT id FROM entities WHERE is_active = true`);
  const evaluated = (await Promise.all(entities.map((e) => evaluateReadiness(period, e.id)))).flat();
  const ids = evaluated.map((r) => r.employee_id);
  const people = ids.length
    ? await query<{ id: string; first_name: string; last_name: string | null; position_type: string; designation: string | null }>(
        `SELECT id, first_name, last_name, position_type, designation FROM employees WHERE id = ANY($1::uuid[])`,
        [ids],
      )
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));

  const rows: TeamRow[] = evaluated.map((r) => {
    const p = byId.get(r.employee_id);
    return {
      employee_id: r.employee_id,
      name: p ? `${p.first_name} ${p.last_name ?? ""}`.trim() : "Employee",
      role: p ? p.designation || POSITION_WORDS[p.position_type] || p.position_type : "",
      tasks_done: r.tasks_done,
      tasks_assigned: r.tasks_assigned,
      completion_pct: Math.round(r.completion_pct * 100),
      salary_status: r.salary_status,
      blocking_items: r.blocking_items,
    };
  });
  rows.sort(
    (a, b) =>
      STATUS_ORDER[a.salary_status] - STATUS_ORDER[b.salary_status] ||
      b.tasks_assigned - a.tasks_assigned ||
      a.name.localeCompare(b.name),
  );
  return {
    ready: rows.filter((r) => r.salary_status === "ready").length,
    review_needed: rows.filter((r) => r.salary_status === "review_needed").length,
    on_hold: rows.filter((r) => r.salary_status === "on_hold").length,
    rows,
  };
}

const ACTION_WORDS: Record<string, string> = {
  accept: "Reason accepted",
  counsel: "Staff counselled",
  reassign: "Reassigned",
  escalate: "Escalated to client",
  approve_handover: "Handover approved",
};

async function buildTasksNotCompleted(
  period: string,
  scope: AccessScope,
): Promise<NonNullable<Overview["tasks_not_completed"]>> {
  const { end } = periodBounds(period);
  const params: unknown[] = [end];
  let scopeSql = "";
  if (scope.mode !== "all") {
    params.push(scope.userId);
    scopeSql = `AND ${taskVisibleSql(scope, params.length)}`;
  }

  const rows = await query<{
    id: string;
    engagement_id: string;
    engagement_code: string | null;
    title: string;
    area: string | null;
    client: string | null;
    assignee: string | null;
    has_assignee: boolean;
    due_date: string;
    days_late: number;
    reason_label: string | null;
    disposition_action: string | null;
    impact: string | null;
    free_text: string | null;
  }>(
    `SELECT ti.id, ti.engagement_id, e.engagement_code, ti.title,
            ti.library_area_name AS area, c.name AS client,
            COALESCE(NULLIF(trim(au.name), ''), au.email) AS assignee,
            (ti.assigned_to IS NOT NULL) AS has_assignee,
            to_char(ti.due_date, 'YYYY-MM-DD') AS due_date,
            (CURRENT_DATE - ti.due_date)::int AS days_late,
            lr.reason_label, lr.disposition_action, lr.impact, lr.free_text
       FROM task_instances ti
       LEFT JOIN users au ON au.id = ti.assigned_to
       LEFT JOIN engagements e ON e.id = ti.engagement_id
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN LATERAL (
         SELECT rd.label AS reason_label, d.disposition_action,
                rd.metadata ->> 'default_payroll_impact' AS impact, d.free_text
           FROM delay_reason_dispositions d
           JOIN reference_data rd ON rd.id = d.reason_id
          WHERE d.task_instance_id = ti.id AND rd.code IS DISTINCT FROM 'DR-06'
          ORDER BY d.logged_at DESC LIMIT 1
       ) lr ON true
      WHERE ti.due_date IS NOT NULL
        AND ti.due_date < LEAST($1::date, CURRENT_DATE)
        AND ti.status NOT IN ('completed', 'not_applicable')
        ${scopeSql}
      ORDER BY ti.due_date ASC
      LIMIT 200`,
    params,
  );

  const mapped: TaskRow[] = rows.map((r) => {
    // Same rules as the payroll engine (FR-13, FR-60, Gap #21).
    let blocking = false;
    if (r.has_assignee) {
      if (!r.reason_label) blocking = true;
      else if (r.disposition_action === "accept" || r.disposition_action === "escalate") blocking = false;
      else if (r.disposition_action === null && r.impact === "neutral") blocking = false;
      else blocking = true;
    }
    return {
      id: r.id,
      engagement_id: r.engagement_id,
      engagement_code: r.engagement_code,
      title: r.title,
      area: r.area,
      client: r.client,
      assignee: r.assignee ?? "Unassigned",
      due_date: r.due_date,
      days_late: r.days_late,
      reason: r.reason_label ? (r.free_text ? `${r.reason_label}: ${r.free_text}` : r.reason_label) : null,
      partner_action: r.disposition_action ? ACTION_WORDS[r.disposition_action] ?? r.disposition_action : null,
      blocking,
    };
  });
  mapped.sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.days_late - a.days_late);
  return {
    total: mapped.length,
    blocking: mapped.filter((t) => t.blocking).length,
    rows: mapped.slice(0, 100),
  };
}

export async function buildOverview(
  period: string,
  opts: { finance: boolean; team: boolean; scope: AccessScope },
): Promise<Overview> {
  const { start, end } = periodBounds(period);

  const taskCounts = await query<{ total: string; closed: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status IN ('completed', 'not_applicable'))::text AS closed
       FROM task_instances
      WHERE due_date >= $1::date AND due_date < $2::date`,
    [start, end],
  );
  const staff = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM employees WHERE status = 'active'`);
  const total = Number(taskCounts[0]?.total ?? 0);
  const closed = Number(taskCounts[0]?.closed ?? 0);

  const [finance, team, tasks] = await Promise.all([
    opts.finance ? buildFinance(period) : Promise.resolve(null),
    opts.team ? buildTeam(period) : Promise.resolve(null),
    opts.team ? buildTasksNotCompleted(period, opts.scope) : Promise.resolve(null),
  ]);

  return {
    period,
    utilisation: {
      pct: total > 0 ? Math.round((closed / total) * 100) : 0,
      staff_count: Number(staff[0]?.n ?? 0),
      tasks_closed: closed,
      tasks_total: total,
    },
    finance,
    team,
    tasks_not_completed: tasks,
  };
}
