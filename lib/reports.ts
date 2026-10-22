/**
 * Standard report set (FR-79, FR-80).
 *
 * Twelve reports from the requirements document plus an invoice register. Each
 * takes a date range and, where it makes sense, an entity, a partner and a
 * client group. Every filter is passed to the database as a parameter, and
 * reports that touch clients, engagements or tasks only include what the
 * signed-in user may see (FR-03). Money reports need billing or finance
 * access, payroll needs payroll access (§4).
 *
 * Definitions for the choices the PDF leaves open are in the comments of each
 * report and listed as Gap #64.
 */
import { query } from "@/lib/db";
import {
  clientVisibleSql,
  engagementVisibleSql,
  taskVisibleSql,
  type AccessScope,
} from "@/lib/access-scope";
import { decryptField } from "@/lib/field-crypto";
import { CLIENT_CHECKLIST } from "@/lib/client-checklist";
import { areaOfAddress } from "@/lib/client-directory";

export interface ReportContext {
  userId: string;
  scope: AccessScope;
  billing: boolean;
  finance: boolean;
  payroll: boolean;
  employees: boolean;
}

export type ColType = "text" | "money" | "number" | "date" | "percent";
export interface Column {
  key: string;
  label: string;
  type?: ColType;
}
export interface Table {
  title?: string;
  columns: Column[];
  rows: Record<string, unknown>[];
}
export interface ReportResult extends Table {
  notes?: string[];
  extra?: Table[];
}
export interface Filters {
  from: string;
  to: string;
  entity_id?: string;
  partner_id?: string;
  group_id?: string;
  by?: string;
}
export type FilterKind = "dates" | "entity" | "partner" | "group" | "by";

export interface ReportDef {
  id: string;
  name: string;
  description: string;
  category: string;
  uses: FilterKind[];
  allowed: (ctx: ReportContext) => boolean;
  run: (f: Filters, ctx: ReportContext) => Promise<ReportResult>;
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

class Q {
  conds: string[] = [];
  params: unknown[] = [];
  p(v: unknown): string {
    this.params.push(v);
    return `$${this.params.length}`;
  }
  /** Add a condition; each ? becomes the next parameter. */
  add(sql: string, ...vals: unknown[]) {
    let i = 0;
    this.conds.push(sql.replace(/\?/g, () => this.p(vals[i++])));
  }
  where() {
    return this.conds.length ? `WHERE ${this.conds.join(" AND ")}` : "";
  }
}

function scopeClient(q: Q, ctx: ReportContext, col: string) {
  if (ctx.scope.mode === "all") return;
  q.params.push(ctx.userId);
  q.conds.push(clientVisibleSql(ctx.scope, col, q.params.length));
}
function scopeEngagement(q: Q, ctx: ReportContext, col: string) {
  if (ctx.scope.mode === "all") return;
  q.params.push(ctx.userId);
  q.conds.push(engagementVisibleSql(ctx.scope, col, q.params.length));
}
function scopeTask(q: Q, ctx: ReportContext) {
  if (ctx.scope.mode === "all" && !ctx.scope.ownTasksOnly) return;
  q.params.push(ctx.userId);
  q.conds.push(taskVisibleSql(ctx.scope, q.params.length));
}

const STAGE: Record<string, string> = {
  imported: "Imported",
  kyc_and_docs: "KYC & Docs",
  conflict_check: "Conflict check",
  engagement_letter: "Engagement letter",
  activated: "Activated",
};
const STATUS_WORDS = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const partnerName = `COALESCE(NULLIF(trim(pu.name), ''), pu.email)`;

const RAISED = ["issued", "sent", "partially_paid", "paid", "overdue"];
const PARTNER_OF_ENGAGEMENT = "COALESCE(e.partner_in_charge_id, c.partner_in_charge_id)";

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

async function clientMaster(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("c.is_active = true");
  if (f.partner_id) q.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeClient(q, ctx, "c.id");
  const rows = await query<Record<string, unknown>>(
    `SELECT c.client_code, c.name, c.trade_name, rd.label AS type, c.pan, c.gstin, c.address,
            g.name AS group_name, ${partnerName} AS partner, c.onboarding_status,
            EXISTS (SELECT 1 FROM onboarding_checklist_items o WHERE o.owner_type = 'client' AND o.owner_id = c.id
                       AND o.checklist_item_code = 'kyc_signatories' AND o.is_complete) AS kyc,
            (SELECT string_agg(st.name, ', ' ORDER BY st.name) FROM client_service_scope s
               JOIN service_types st ON st.id = s.service_type_id WHERE s.client_id = c.id) AS services
       FROM clients c
       LEFT JOIN reference_data rd ON rd.id = c.entity_type_id
       LEFT JOIN client_groups g ON g.id = c.group_id
       LEFT JOIN users pu ON pu.id = c.partner_in_charge_id
       ${q.where()} ORDER BY c.name`,
    q.params,
  );
  return {
    columns: [
      { key: "client_code", label: "Code" },
      { key: "name", label: "Client" },
      { key: "trade_name", label: "Trade name" },
      { key: "type", label: "Type" },
      { key: "pan", label: "PAN (last 4)" },
      { key: "gstin", label: "GSTIN" },
      { key: "area", label: "City / area" },
      { key: "group_name", label: "Group" },
      { key: "partner", label: "Partner in charge" },
      { key: "stage", label: "Onboarding" },
      { key: "kyc", label: "KYC verified" },
      { key: "services", label: "Services" },
    ],
    rows: rows.map((r) => {
      let pan: string | null = null;
      try {
        pan = decryptField(r.pan as string | null);
      } catch {
        pan = null;
      }
      return {
        ...r,
        pan: pan ? `••••••${pan.slice(-4)}` : null,
        area: areaOfAddress((r.address as string | null) ?? null),
        stage: STAGE[String(r.onboarding_status)] ?? r.onboarding_status,
        kyc: r.kyc ? "Yes" : "No",
      };
    }),
    notes: ["PAN shows the last four characters only."],
  };
}

async function onboardingStatus(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("c.is_active = true");
  if (f.partner_id) q.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeClient(q, ctx, "c.id");
  const rows = await query<Record<string, unknown>>(
    `SELECT c.client_code, c.name, c.onboarding_status, ${partnerName} AS partner,
            c.partner_in_charge_id IS NOT NULL AS has_partner,
            (SELECT COALESCE(array_agg(o.checklist_item_code), '{}') FROM onboarding_checklist_items o
               WHERE o.owner_type = 'client' AND o.owner_id = c.id AND o.is_complete) AS done_codes
       FROM clients c LEFT JOIN users pu ON pu.id = c.partner_in_charge_id
       ${q.where()} ORDER BY c.name`,
    q.params,
  );
  const out = rows.map((r) => {
    const done = new Set<string>((r.done_codes as string[]) ?? []);
    if (r.has_partner) done.add("partner_assigned");
    const open = CLIENT_CHECKLIST.filter((i) => !done.has(i.code)).map((i) => i.label);
    return {
      client_code: r.client_code,
      name: r.name,
      stage: STAGE[String(r.onboarding_status)] ?? r.onboarding_status,
      partner: r.partner,
      done: CLIENT_CHECKLIST.length - open.length,
      progress: `${CLIENT_CHECKLIST.length - open.length} / ${CLIENT_CHECKLIST.length}`,
      open_items: open.join("; "),
    };
  });
  return {
    columns: [
      { key: "client_code", label: "Code" },
      { key: "name", label: "Client" },
      { key: "stage", label: "Stage" },
      { key: "partner", label: "Partner in charge" },
      { key: "progress", label: "Checklist" },
      { key: "open_items", label: "Still open" },
    ],
    rows: out,
    notes: [`${out.filter((r) => r.stage === "Activated").length} of ${out.length} clients are activated.`],
  };
}

async function engagementStatus(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  // In range: the period overlaps it, or, with no period, it was created in it.
  q.add(
    `COALESCE(e.period_start, e.created_at::date) <= ?::date AND COALESCE(e.period_end, e.created_at::date) >= ?::date`,
    f.to,
    f.from,
  );
  if (f.entity_id) q.add("e.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add(`${PARTNER_OF_ENGAGEMENT} = ?`, f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeEngagement(q, ctx, "e.id");
  const rows = await query<Record<string, unknown>>(
    `SELECT e.engagement_code, c.name AS client, st.name AS service, ent.short_code AS entity,
            ${partnerName} AS partner,
            CASE WHEN e.is_recurring THEN 'Recurring' ELSE 'One-time' END AS kind,
            e.period_start, e.period_end, e.status, e.progress_pct,
            (SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status = 'completed') AS tasks_done,
            (SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status <> 'not_applicable') AS tasks_total,
            e.agreed_fee::float8 AS agreed_fee
       FROM engagements e
       JOIN clients c ON c.id = e.client_id
       JOIN service_types st ON st.id = e.service_type_id
       JOIN entities ent ON ent.id = e.billing_entity_id
       LEFT JOIN users pu ON pu.id = ${PARTNER_OF_ENGAGEMENT}
       ${q.where()} ORDER BY e.created_at DESC`,
    q.params,
  );
  const columns: Column[] = [
    { key: "engagement_code", label: "Engagement" },
    { key: "client", label: "Client" },
    { key: "service", label: "Service" },
    { key: "entity", label: "Entity" },
    { key: "partner", label: "Partner" },
    { key: "kind", label: "Type" },
    { key: "period_start", label: "Period from", type: "date" },
    { key: "period_end", label: "Period to", type: "date" },
    { key: "status_label", label: "Status" },
    { key: "progress_pct", label: "Progress", type: "percent" },
    { key: "tasks", label: "Tasks done" },
  ];
  if (ctx.billing) columns.push({ key: "agreed_fee", label: "Agreed fee", type: "money" });
  return {
    columns,
    rows: rows.map((r) => ({
      ...r,
      status_label: STATUS_WORDS(String(r.status)),
      progress_pct: num(r.progress_pct),
      tasks: `${r.tasks_done} / ${r.tasks_total}`,
    })),
    notes: ctx.billing ? undefined : ["Agreed fees are shown only to roles with billing access."],
  };
}

async function taskCompletion(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("ti.status <> 'not_applicable'");
  q.add(
    `((ti.due_date >= ?::date AND ti.due_date <= ?::date)
      OR (ti.due_date IS NULL AND ti.completed_at::date >= ?::date AND ti.completed_at::date <= ?::date))`,
    f.from,
    f.to,
    f.from,
    f.to,
  );
  if (f.entity_id) q.add("e.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add(`${PARTNER_OF_ENGAGEMENT} = ?`, f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeTask(q, ctx);
  const rows = await query<Record<string, unknown>>(
    `SELECT COALESCE(NULLIF(trim(u.name), ''), u.email, 'Not assigned') AS employee,
            COUNT(*) AS assigned,
            COUNT(*) FILTER (WHERE ti.status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE ti.status NOT IN ('completed', 'not_applicable') AND ti.due_date < CURRENT_DATE) AS overdue,
            COUNT(*) FILTER (WHERE ti.status = 'completed' AND ti.completed_at::date <= ti.due_date) AS on_time
       FROM task_instances ti
       JOIN engagements e ON e.id = ti.engagement_id
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN users u ON u.id = ti.assigned_to
       ${q.where()}
      GROUP BY 1 ORDER BY 1`,
    q.params,
  );
  return {
    columns: [
      { key: "employee", label: "Employee" },
      { key: "assigned", label: "Assigned", type: "number" },
      { key: "completed", label: "Completed", type: "number" },
      { key: "overdue", label: "Overdue now", type: "number" },
      { key: "completion", label: "Completion %", type: "percent" },
      { key: "on_time", label: "On-time %", type: "percent" },
    ],
    rows: rows.map((r) => ({
      employee: r.employee,
      assigned: num(r.assigned),
      completed: num(r.completed),
      overdue: num(r.overdue),
      completion: pct(num(r.completed), num(r.assigned)),
      on_time: pct(num(r.on_time), num(r.completed)),
    })),
    notes: [
      "Tasks are counted by their due date in the range; a task with no due date is counted if it was completed in the range.",
      "On-time % is completed tasks finished on or before their due date.",
    ],
  };
}

async function delayReasons(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("drd.logged_at::date >= ?::date AND drd.logged_at::date <= ?::date", f.from, f.to);
  if (f.entity_id) q.add("e.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add(`${PARTNER_OF_ENGAGEMENT} = ?`, f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeTask(q, ctx);
  const rows = await query<Record<string, unknown>>(
    `SELECT drd.logged_at, c.name AS client, e.engagement_code, ti.title AS task,
            COALESCE(NULLIF(trim(au.name), ''), au.email) AS assignee,
            rd.label AS reason, drd.free_text, drd.disposition_action,
            COALESCE(NULLIF(trim(du.name), ''), du.email) AS decided_by
       FROM delay_reason_dispositions drd
       JOIN task_instances ti ON ti.id = drd.task_instance_id
       JOIN engagements e ON e.id = ti.engagement_id
       JOIN clients c ON c.id = e.client_id
       JOIN reference_data rd ON rd.id = drd.reason_id
       LEFT JOIN users au ON au.id = ti.assigned_to
       LEFT JOIN users du ON du.id = drd.dispositioned_by
       ${q.where()} ORDER BY drd.logged_at DESC`,
    q.params,
  );
  const detail = rows.map((r) => ({
    ...r,
    action: r.disposition_action ? STATUS_WORDS(String(r.disposition_action)) : "Awaiting partner",
  }));
  const countBy = (key: string) => {
    const m = new Map<string, number>();
    for (const r of detail) m.set(String(r[key] ?? "—"), (m.get(String(r[key] ?? "—")) ?? 0) + 1);
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, share: pct(count, detail.length) }));
  };
  const summaryCols: Column[] = [
    { key: "name", label: "" },
    { key: "count", label: "Times logged", type: "number" },
    { key: "share", label: "Share", type: "percent" },
  ];
  return {
    columns: [
      { key: "logged_at", label: "Logged", type: "date" },
      { key: "client", label: "Client" },
      { key: "engagement_code", label: "Engagement" },
      { key: "task", label: "Task" },
      { key: "assignee", label: "Doer" },
      { key: "reason", label: "Reason" },
      { key: "free_text", label: "Explanation" },
      { key: "action", label: "Partner decision" },
      { key: "decided_by", label: "Decided by" },
    ],
    rows: detail,
    extra: [
      { title: "By reason", columns: [{ ...summaryCols[0], label: "Reason" }, summaryCols[1], summaryCols[2]], rows: countBy("reason") },
      { title: "By partner decision", columns: [{ ...summaryCols[0], label: "Decision" }, summaryCols[1], summaryCols[2]], rows: countBy("action") },
    ],
  };
}

async function complianceCalendar(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("sd.due_date >= ?::date AND sd.due_date <= ?::date", f.from, f.to);
  if (f.partner_id) q.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeClient(q, ctx, "c.id");
  const rows = await query<Record<string, unknown>>(
    `SELECT sd.due_date, c.name AS client, sd.obligation_name, sd.period_label, sd.status,
            sd.escalation_level, COALESCE(NULLIF(trim(ou.name), ''), ou.email) AS owner, sd.completed_at
       FROM statutory_due_dates sd
       JOIN clients c ON c.id = sd.client_id
       LEFT JOIN users ou ON ou.id = sd.owner_id
       ${q.where()} ORDER BY sd.due_date, c.name`,
    q.params,
  );
  return {
    columns: [
      { key: "due_date", label: "Due", type: "date" },
      { key: "client", label: "Client" },
      { key: "obligation_name", label: "Obligation" },
      { key: "period_label", label: "Period" },
      { key: "status_label", label: "Status" },
      { key: "level", label: "Escalation level", type: "number" },
      { key: "owner", label: "Owner" },
      { key: "completed_at", label: "Completed", type: "date" },
    ],
    rows: rows.map((r) => ({ ...r, status_label: STATUS_WORDS(String(r.status)), level: num(r.escalation_level) })),
  };
}

async function arAgeing(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("i.status NOT IN ('draft', 'cancelled', 'written_off')");
  q.add("i.invoice_date <= ?::date", f.to);
  if (f.entity_id) q.add("i.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeClient(q, ctx, "c.id");
  const toParam = q.p(f.to);
  const rows = await query<Record<string, unknown>>(
    `SELECT i.invoice_number, c.name AS client, ent.short_code AS entity, i.invoice_date, i.due_date,
            i.total_amount::float8 AS total,
            COALESCE((SELECT SUM(r.amount + COALESCE(r.tds_amount, 0)) FROM receipts r
                       WHERE r.invoice_id = i.id AND r.receipt_date <= ${toParam}::date), 0)::float8 AS settled,
            (${toParam}::date - COALESCE(i.due_date, i.invoice_date)::date)::int AS age_days
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       JOIN entities ent ON ent.id = i.billing_entity_id
       ${q.where()} ORDER BY age_days DESC`,
    q.params,
  );
  const bucketOf = (d: number) => (d <= 30 ? "0 to 30" : d <= 60 ? "31 to 60" : d <= 90 ? "61 to 90" : "Over 90");
  const open = rows
    .map((r) => ({ ...r, outstanding: r2(num(r.total) - num(r.settled)) }))
    .filter((r) => r.outstanding > 0.01)
    .map((r) => ({ ...r, age_days: Math.max(0, num(r.age_days)), bucket: bucketOf(Math.max(0, num(r.age_days))) }));
  const buckets = ["0 to 30", "31 to 60", "61 to 90", "Over 90"].map((b) => {
    const list = open.filter((r) => r.bucket === b);
    return { bucket: b, invoices: list.length, outstanding: r2(list.reduce((s, r) => s + r.outstanding, 0)) };
  });
  return {
    columns: [
      { key: "client", label: "Client" },
      { key: "invoice_number", label: "Invoice no." },
      { key: "entity", label: "Entity" },
      { key: "invoice_date", label: "Invoice date", type: "date" },
      { key: "due_date", label: "Due date", type: "date" },
      { key: "total", label: "Amount", type: "money" },
      { key: "settled", label: "Received + TDS", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
      { key: "age_days", label: "Days overdue", type: "number" },
      { key: "bucket", label: "Bucket" },
    ],
    rows: open,
    extra: [
      {
        title: "By age",
        columns: [
          { key: "bucket", label: "Days overdue" },
          { key: "invoices", label: "Invoices", type: "number" },
          { key: "outstanding", label: "Outstanding", type: "money" },
        ],
        rows: buckets,
      },
    ],
    notes: [`As at ${f.to}. Age counts from the due date, or the invoice date when there is none.`],
  };
}

async function realisation(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const byService = f.by === "service_line";
  const filt = new Q();
  if (f.entity_id) filt.add("i.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) filt.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) filt.add("c.group_id = ?", f.group_id);
  scopeClient(filt, ctx, "c.id");
  const extra = filt.conds.length ? ` AND ${filt.conds.join(" AND ")}` : "";

  const billedP = new Q();
  billedP.params = [...filt.params];
  const fromP = `$${billedP.params.push(f.from)}`;
  const toP = `$${billedP.params.push(f.to)}`;
  const billed = await query<{ id: string; client_id: string; client: string; total: number }>(
    `SELECT i.id, i.client_id, c.name AS client, i.total_amount::float8 AS total
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.status = ANY(${billedP.p(RAISED)}::text[]) AND i.invoice_date >= ${fromP}::date AND i.invoice_date <= ${toP}::date ${extra}`,
    billedP.params,
  );
  const collP = new Q();
  collP.params = [...filt.params];
  const cFrom = `$${collP.params.push(f.from)}`;
  const cTo = `$${collP.params.push(f.to)}`;
  const collected = await query<{ invoice_id: string; client_id: string; client: string; amount: number }>(
    `SELECT r.invoice_id, i.client_id, c.name AS client, SUM(r.amount)::float8 AS amount
       FROM receipts r JOIN invoices i ON i.id = r.invoice_id JOIN clients c ON c.id = i.client_id
      WHERE i.status <> 'cancelled' AND r.receipt_date >= ${cFrom}::date AND r.receipt_date <= ${cTo}::date ${extra}
      GROUP BY r.invoice_id, i.client_id, c.name`,
    collP.params,
  );

  const totals = new Map<string, { name: string; billed: number; collected: number }>();
  const bump = (key: string, name: string, field: "billed" | "collected", amt: number) => {
    const t = totals.get(key) ?? { name, billed: 0, collected: 0 };
    t[field] += amt;
    totals.set(key, t);
  };

  if (!byService) {
    for (const b of billed) bump(b.client_id, b.client, "billed", b.total);
    for (const c of collected) bump(c.client_id, c.client, "collected", c.amount);
  } else {
    const ids = Array.from(new Set([...billed.map((b) => b.id), ...collected.map((c) => c.invoice_id)]));
    const lines = ids.length
      ? await query<{ invoice_id: string; amount: number | null; line: string }>(
          `SELECT ie.invoice_id, ie.amount::float8 AS amount,
                  CASE WHEN st.description ILIKE 'Category:%'
                       THEN trim(substr(st.description, 10)) ELSE st.name END AS line
             FROM invoice_engagements ie
             JOIN engagements e ON e.id = ie.engagement_id
             JOIN service_types st ON st.id = e.service_type_id
            WHERE ie.invoice_id = ANY($1::uuid[])`,
          [ids],
        )
      : [];
    const byInvoice = new Map<string, { amount: number | null; line: string }[]>();
    for (const l of lines) byInvoice.set(l.invoice_id, [...(byInvoice.get(l.invoice_id) ?? []), l]);
    const spread = (invoiceId: string, amount: number, field: "billed" | "collected") => {
      const ls = byInvoice.get(invoiceId) ?? [];
      if (ls.length === 0) return bump("unallocated", "Not linked to a service", field, amount);
      const sum = ls.reduce((s, l) => s + num(l.amount), 0);
      for (const l of ls) {
        const w = sum > 0 ? num(l.amount) / sum : 1 / ls.length;
        bump(l.line, l.line, field, amount * w);
      }
    };
    for (const b of billed) spread(b.id, b.total, "billed");
    for (const c of collected) spread(c.invoice_id, c.amount, "collected");
  }

  const rows = Array.from(totals.values())
    .map((t) => ({ name: t.name, billed: r2(t.billed), collected: r2(t.collected), realisation: pct(t.collected, t.billed) }))
    .sort((a, b) => b.billed - a.billed);
  const sumB = r2(rows.reduce((s, r) => s + r.billed, 0));
  const sumC = r2(rows.reduce((s, r) => s + r.collected, 0));
  rows.push({ name: "Total", billed: sumB, collected: sumC, realisation: pct(sumC, sumB) });
  return {
    columns: [
      { key: "name", label: byService ? "Service line" : "Client" },
      { key: "billed", label: "Billed (incl. GST)", type: "money" },
      { key: "collected", label: "Collected", type: "money" },
      { key: "realisation", label: "Realisation", type: "percent" },
    ],
    rows,
    notes: [
      "Billed is invoices raised in the range; collected is money received in the range. They can differ in timing.",
      byService ? "An invoice covering several engagements is split across their service lines in proportion to each engagement's amount." : "",
    ].filter(Boolean),
  };
}

async function wip(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  // Per-visit fees are a rate per visit, and visits are not tracked, so they are billed as visits happen and have no WIP figure (FR-47).
  q.add("e.status IN ('active', 'in_progress', 'on_hold', 'completed') AND e.agreed_fee IS NOT NULL AND e.agreed_fee > 0 AND COALESCE(e.fee_basis, '') <> 'per_visit'");
  if (f.entity_id) q.add("e.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add(`${PARTNER_OF_ENGAGEMENT} = ?`, f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeEngagement(q, ctx, "e.id");
  const raisedP = q.p(RAISED);
  const rows = await query<Record<string, unknown>>(
    `SELECT e.engagement_code, c.name AS client, st.name AS service, ent.short_code AS entity,
            e.agreed_fee::float8 AS agreed_fee,
            COALESCE(ROUND(100.0 * COUNT(ti.id) FILTER (WHERE ti.status = 'completed')
              / NULLIF(COUNT(ti.id) FILTER (WHERE ti.status <> 'not_applicable'), 0)), 0)::int AS progress,
            COALESCE((SELECT SUM(ie.amount) FROM invoice_engagements ie JOIN invoices i ON i.id = ie.invoice_id
                       WHERE ie.engagement_id = e.id AND i.status = ANY(${raisedP}::text[])), 0)::float8 AS billed
       FROM engagements e
       JOIN clients c ON c.id = e.client_id
       JOIN service_types st ON st.id = e.service_type_id
       JOIN entities ent ON ent.id = e.billing_entity_id
       LEFT JOIN task_instances ti ON ti.engagement_id = e.id
       ${q.where()}
      GROUP BY e.id, c.name, st.name, ent.short_code`,
    q.params,
  );
  const out = rows
    .map((r) => {
      const value = r2(num(r.agreed_fee) * (num(r.progress) / 100));
      return { ...r, wip_value: value, unbilled: r2(Math.max(0, value - num(r.billed))) };
    })
    .sort((a, b) => b.unbilled - a.unbilled);
  const total = r2(out.reduce((s, r) => s + r.unbilled, 0));
  return {
    columns: [
      { key: "engagement_code", label: "Engagement" },
      { key: "client", label: "Client" },
      { key: "service", label: "Service" },
      { key: "entity", label: "Entity" },
      { key: "agreed_fee", label: "Agreed fee", type: "money" },
      { key: "progress", label: "Progress", type: "percent" },
      { key: "wip_value", label: "Work done (value)", type: "money" },
      { key: "billed", label: "Already billed", type: "money" },
      { key: "unbilled", label: "Unbilled", type: "money" },
    ],
    rows: out,
    notes: [
      `Total unbilled work: ₹${total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}. Work done is the agreed fee times the progress %.`,
      "Only engagements that have started count: Active, On hold and Completed. Drafts and cancelled engagements are left out.",
    ],
  };
}

async function entityPl(f: Filters): Promise<ReportResult> {
  const q = new Q();
  const raised = q.p(RAISED);
  const from = q.p(f.from);
  const to = q.p(f.to);
  const entFilter = f.entity_id ? `WHERE ent.id = ${q.p(f.entity_id)}` : "";
  const rows = await query<Record<string, unknown>>(
    `SELECT ent.short_code AS entity, ent.name AS entity_name,
            COALESCE((SELECT SUM(i.subtotal) FROM invoices i WHERE i.billing_entity_id = ent.id
                       AND i.status = ANY(${raised}::text[]) AND i.invoice_date >= ${from}::date AND i.invoice_date <= ${to}::date), 0)::float8 AS income,
            COALESCE((SELECT SUM(x.amount) FROM expenses x WHERE x.entity_id = ent.id
                       AND x.expense_date >= ${from}::date AND x.expense_date <= ${to}::date), 0)::float8 AS expenses,
            COALESCE((SELECT SUM(r.amount) FROM receipts r JOIN invoices i ON i.id = r.invoice_id
                       WHERE i.billing_entity_id = ent.id AND r.receipt_date >= ${from}::date AND r.receipt_date <= ${to}::date), 0)::float8 AS collected
       FROM entities ent ${entFilter} ORDER BY ent.short_code`,
    q.params,
  );
  const out = rows.map((r) => ({
    entity: r.entity_name,
    income: r2(num(r.income)),
    expenses: r2(num(r.expenses)),
    net: r2(num(r.income) - num(r.expenses)),
    collected: r2(num(r.collected)),
  }));
  if (out.length > 1) {
    out.push({
      entity: "All entities together",
      income: r2(out.reduce((s, r) => s + r.income, 0)),
      expenses: r2(out.reduce((s, r) => s + r.expenses, 0)),
      net: r2(out.reduce((s, r) => s + r.net, 0)),
      collected: r2(out.reduce((s, r) => s + r.collected, 0)),
    });
  }
  return {
    columns: [
      { key: "entity", label: "Entity" },
      { key: "income", label: "Income", type: "money" },
      { key: "expenses", label: "Expenses", type: "money" },
      { key: "net", label: "Net profit", type: "money" },
      { key: "collected", label: "Cash collected", type: "money" },
    ],
    rows: out,
    notes: ["Income is fees invoiced in the range, before GST and excluding reimbursements (Gap #50). Cash collected is shown separately."],
  };
}

async function payrollRegister(f: Filters): Promise<ReportResult> {
  const periods: string[] = [];
  const [fy, fm] = f.from.split("-").map(Number);
  const [ty, tm] = f.to.split("-").map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    periods.push(`${y}-${String(m).padStart(2, "0")}`);
    if (periods.length > 36) break;
  }
  const q = new Q();
  q.add("pr.period = ANY(?::text[])", periods);
  if (f.entity_id) q.add("pr.payroll_entity_id = ?", f.entity_id);
  const rows = await query<Record<string, unknown>>(
    `SELECT pr.period, trim(emp.first_name || ' ' || COALESCE(emp.last_name, '')) AS employee, emp.designation,
            ent.short_code AS entity, pr.salary_status, pr.task_completion_pct, pr.open_blocking_items, pr.released_at
       FROM payroll_readiness pr
       JOIN employees emp ON emp.id = pr.employee_id
       JOIN entities ent ON ent.id = pr.payroll_entity_id
       ${q.where()} ORDER BY pr.period DESC, emp.first_name`,
    q.params,
  );
  return {
    columns: [
      { key: "period", label: "Month" },
      { key: "employee", label: "Employee" },
      { key: "designation", label: "Designation" },
      { key: "entity", label: "Payroll entity" },
      { key: "status", label: "Salary status" },
      { key: "task_completion_pct", label: "Completion", type: "percent" },
      { key: "open_blocking_items", label: "Blocking items", type: "number" },
      { key: "released_at", label: "Released", type: "date" },
    ],
    rows: rows.map((r) => ({
      ...r,
      status: STATUS_WORDS(String(r.salary_status)),
      task_completion_pct: num(r.task_completion_pct),
      open_blocking_items: num(r.open_blocking_items),
    })),
    notes: ["Months are taken from the range. Only months that have been computed on the Payroll page appear."],
  };
}

async function articleshipRegister(f: Filters): Promise<ReportResult> {
  const q = new Q();
  q.add("emp.position_type ILIKE '%articled%'");
  const asOf = q.p(f.to);
  const rows = await query<Record<string, unknown>>(
    `SELECT emp.employee_id_code, trim(emp.first_name || ' ' || COALESCE(emp.last_name, '')) AS name,
            emp.icai_registration_no, emp.icai_membership_no, emp.articleship_start_date, emp.articleship_end_date,
            COALESCE(NULLIF(trim(mu.name), ''), mu.email) AS mentor, emp.status,
            EXISTS (SELECT 1 FROM onboarding_checklist_items o WHERE o.owner_type = 'employee' AND o.owner_id = emp.id
                      AND o.checklist_item_code = 'icai_registration_articleship' AND o.is_complete) AS reg_doc,
            EXISTS (SELECT 1 FROM onboarding_checklist_items o WHERE o.owner_type = 'employee' AND o.owner_id = emp.id
                      AND o.checklist_item_code = 'icai_itt_orientation' AND o.is_complete) AS itt_doc,
            (SELECT (date_part('year', age(${asOf}::date, emp.articleship_start_date)) * 12
                   + date_part('month', age(${asOf}::date, emp.articleship_start_date)))::int
              WHERE emp.articleship_start_date IS NOT NULL) AS months_done
       FROM employees emp LEFT JOIN users mu ON mu.id = emp.assigned_mentor_partner_id
       ${q.where()} ORDER BY emp.articleship_start_date NULLS LAST, emp.first_name`,
    q.params,
  );
  return {
    columns: [
      { key: "employee_id_code", label: "Staff ID" },
      { key: "name", label: "Articled clerk" },
      { key: "icai_registration_no", label: "ICAI registration no." },
      { key: "icai_membership_no", label: "ICAI membership no." },
      { key: "articleship_start_date", label: "Articleship start", type: "date" },
      { key: "articleship_end_date", label: "Expected completion", type: "date" },
      { key: "months_done", label: "Months completed", type: "number" },
      { key: "mentor", label: "Mentor partner" },
      { key: "reg", label: "Registration documented" },
      { key: "itt", label: "ITT / Orientation documented" },
    ],
    rows: rows.map((r) => ({ ...r, reg: r.reg_doc ? "Yes" : "No", itt: r.itt_doc ? "Yes" : "No" })),
    notes: [`Months completed are counted to ${f.to}. "Documented" means the item is ticked on the employee's onboarding checklist.`],
  };
}

async function invoiceRegister(f: Filters, ctx: ReportContext): Promise<ReportResult> {
  const q = new Q();
  q.add("i.invoice_date >= ?::date AND i.invoice_date <= ?::date", f.from, f.to);
  if (f.entity_id) q.add("i.billing_entity_id = ?", f.entity_id);
  if (f.partner_id) q.add("c.partner_in_charge_id = ?", f.partner_id);
  if (f.group_id) q.add("c.group_id = ?", f.group_id);
  scopeClient(q, ctx, "c.id");
  const rows = await query<Record<string, unknown>>(
    `SELECT i.invoice_number, i.invoice_date, i.due_date, c.name AS client, ent.short_code AS entity, i.status,
            i.subtotal::float8 AS subtotal, (i.cgst + i.sgst + i.igst)::float8 AS gst, i.total_amount::float8 AS total,
            COALESCE((SELECT SUM(r.amount) FROM receipts r WHERE r.invoice_id = i.id), 0)::float8 AS received,
            COALESCE((SELECT SUM(r.tds_amount) FROM receipts r WHERE r.invoice_id = i.id), 0)::float8 AS tds,
            (CURRENT_DATE - i.due_date)::int AS days_late
       FROM invoices i JOIN clients c ON c.id = i.client_id JOIN entities ent ON ent.id = i.billing_entity_id
       ${q.where()} ORDER BY i.invoice_date DESC, i.invoice_number DESC`,
    q.params,
  );
  const out = rows.map((r) => {
    const open = ["issued", "sent", "partially_paid", "overdue"].includes(String(r.status));
    const outstanding = open ? r2(Math.max(0, num(r.total) - num(r.received) - num(r.tds))) : 0;
    return {
      ...r,
      status_label: STATUS_WORDS(String(r.status)),
      outstanding,
      days_late: open && outstanding > 0.01 && r.days_late != null && num(r.days_late) > 0 ? num(r.days_late) : null,
    };
  });
  return {
    columns: [
      { key: "invoice_number", label: "Invoice no." },
      { key: "invoice_date", label: "Date", type: "date" },
      { key: "client", label: "Client" },
      { key: "entity", label: "Entity" },
      { key: "status_label", label: "Status" },
      { key: "subtotal", label: "Fees", type: "money" },
      { key: "gst", label: "GST", type: "money" },
      { key: "total", label: "Amount", type: "money" },
      { key: "received", label: "Received", type: "money" },
      { key: "tds", label: "TDS", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
      { key: "days_late", label: "Days overdue", type: "number" },
    ],
    rows: out,
  };
}

/* ------------------------------------------------------------------ */

export const REPORTS: ReportDef[] = [
  { id: "client_master", name: "Client master", description: "Every client with type, PAN, GSTIN, partner, onboarding stage, KYC and services.", category: "Clients", uses: ["partner", "group"], allowed: () => true, run: clientMaster },
  { id: "onboarding_status", name: "Onboarding status", description: "Each client's stage, checklist progress and the items still open.", category: "Clients", uses: ["partner", "group"], allowed: () => true, run: onboardingStatus },
  { id: "engagement_status", name: "Engagement status", description: "Engagements in the range with period, type, partner, progress and tasks done.", category: "Work", uses: ["dates", "entity", "partner", "group"], allowed: () => true, run: engagementStatus },
  { id: "task_completion", name: "Task completion by employee", description: "Tasks due in the range per employee: assigned, completed, overdue, completion and on-time %.", category: "Work", uses: ["dates", "entity", "partner", "group"], allowed: () => true, run: taskCompletion },
  { id: "delay_reasons", name: "Delay reason analysis", description: "Delay reasons logged in the range, with the partner's decision and totals by reason.", category: "Work", uses: ["dates", "entity", "partner", "group"], allowed: () => true, run: delayReasons },
  { id: "compliance_calendar", name: "Statutory compliance calendar", description: "Statutory due dates in the range with status, escalation level and owner.", category: "Compliance", uses: ["dates", "partner", "group"], allowed: () => true, run: complianceCalendar },
  { id: "ar_ageing", name: "AR ageing", description: "Open invoices by age at the end date: 0 to 30, 31 to 60, 61 to 90 and over 90 days.", category: "Billing", uses: ["dates", "entity", "partner", "group"], allowed: (c) => c.billing, run: arAgeing },
  { id: "realisation", name: "Realisation by client and service line", description: "Billed against collected in the range, as a percentage, by client or by service line.", category: "Billing", uses: ["dates", "entity", "partner", "group", "by"], allowed: (c) => c.billing, run: realisation },
  { id: "wip", name: "WIP report", description: "Work done but not yet billed on each engagement with an agreed fee.", category: "Billing", uses: ["entity", "partner", "group"], allowed: (c) => c.billing, run: wip },
  { id: "invoice_register", name: "Invoice register", description: "All invoices in the range with GST, receipts, TDS and what is outstanding.", category: "Billing", uses: ["dates", "entity", "partner", "group"], allowed: (c) => c.billing, run: invoiceRegister },
  { id: "entity_pl", name: "Entity-wise P&L", description: "Income, expenses and net profit for each entity and all together.", category: "Finance", uses: ["dates", "entity"], allowed: (c) => c.finance, run: (f) => entityPl(f) },
  { id: "payroll_readiness", name: "Payroll readiness register", description: "Each employee's salary status per month: completion, blocking items and release.", category: "People", uses: ["dates", "entity"], allowed: (c) => c.payroll, run: (f) => payrollRegister(f) },
  { id: "articleship_register", name: "Articleship register (ICAI)", description: "Articled clerks with ICAI numbers, articleship dates, months completed and mentor.", category: "People", uses: ["dates"], allowed: (c) => c.employees, run: (f) => articleshipRegister(f) },
];

export function getReport(id: string): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function parseFilters(sp: URLSearchParams): { filters?: Filters; error?: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.get("from") || `${today.slice(0, 7)}-01`;
  const to = sp.get("to") || today;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(from) || !date.test(to)) return { error: "Dates must be in the form YYYY-MM-DD." };
  if (from > to) return { error: "The start date is after the end date." };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pick = (k: string) => {
    const v = sp.get(k);
    return v && v !== "all" ? v : undefined;
  };
  const entity_id = pick("entity_id");
  const partner_id = pick("partner_id");
  const group_id = pick("group_id");
  for (const v of [entity_id, partner_id, group_id]) if (v && !uuid.test(v)) return { error: "A filter value is not valid." };
  return { filters: { from, to, entity_id, partner_id, group_id, by: sp.get("by") ?? undefined } };
}
