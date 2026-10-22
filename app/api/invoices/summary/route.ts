/**
 * GET /api/invoices/summary?billing_entity_id=:id (FR-69, FR-70)
 *   wip            unbilled work across engagements, and the rows behind it
 *   billed_month   invoices raised this month, with the count
 *   collected      received this month, with realisation against billed
 *   overdue_60     owed more than 60 days past due, with the client count
 *
 * Work in progress (DM-13): agreed fee x progress %, less what has been billed
 * on issued invoices. Progress is completed tasks out of tasks that apply.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { OPEN_STATUSES, SETTLED_SQL, markOverdueInvoices } from "@/lib/invoice-status";

const RAISED = ["issued", "sent", "partially_paid", "paid", "overdue"];

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_billing");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    await markOverdueInvoices();
    const entityId = req.nextUrl.searchParams.get("billing_entity_id");

    const invParams: unknown[] = [RAISED];
    let invEntity = "";
    if (entityId) {
      invParams.push(entityId);
      invEntity = `AND i.billing_entity_id = $${invParams.length}`;
    }

    const billed = await query<{ amount: number; n: string }>(
      `SELECT COALESCE(SUM(i.total_amount), 0)::float8 AS amount, COUNT(*)::text AS n
         FROM invoices i
        WHERE i.status = ANY($1::text[]) ${invEntity}
          AND i.invoice_date >= date_trunc('month', CURRENT_DATE)::date
          AND i.invoice_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date`,
      invParams,
    );

    const rcpParams: unknown[] = [];
    let rcpEntity = "";
    if (entityId) {
      rcpParams.push(entityId);
      rcpEntity = `AND i.billing_entity_id = $1`;
    }
    const collected = await query<{ amount: number }>(
      `SELECT COALESCE(SUM(r.amount), 0)::float8 AS amount
         FROM receipts r JOIN invoices i ON i.id = r.invoice_id
        WHERE r.receipt_date >= date_trunc('month', CURRENT_DATE)::date
          AND r.receipt_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
          ${rcpEntity}`,
      rcpParams,
    );

    const openParams: unknown[] = [[...OPEN_STATUSES]];
    let openEntity = "";
    if (entityId) {
      openParams.push(entityId);
      openEntity = `AND i.billing_entity_id = $${openParams.length}`;
    }
    const overdue = await query<{ client_id: string; outstanding: number }>(
      `SELECT client_id, outstanding FROM (
         SELECT i.client_id,
                (i.total_amount::float8 - ${SETTLED_SQL}) AS outstanding,
                (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)::date)::int AS age_days
           FROM invoices i
          WHERE i.status = ANY($1::text[]) ${openEntity}
       ) s WHERE outstanding > 0.01 AND age_days > 60`,
      openParams,
    );

    const wipParams: unknown[] = [];
    let wipEntity = "";
    if (entityId) {
      wipParams.push(entityId);
      wipEntity = `AND e.billing_entity_id = $1`;
    }
    const wipRows = await query<{
      engagement_id: string;
      engagement_code: string;
      client_name: string | null;
      service: string | null;
      client_id: string;
      status: string;
      agreed_fee: number;
      progress_pct: number;
      billed: number;
    }>(
      `SELECT e.id AS engagement_id, e.engagement_code, e.client_id, c.name AS client_name,
              st.name AS service, e.status, e.agreed_fee::float8 AS agreed_fee,
              COALESCE(ROUND(100.0 * COUNT(ti.id) FILTER (WHERE ti.status = 'completed')
                / NULLIF(COUNT(ti.id) FILTER (WHERE ti.status <> 'not_applicable'), 0)), 0)::int AS progress_pct,
              COALESCE((SELECT SUM(ie.amount) FROM invoice_engagements ie
                          JOIN invoices i ON i.id = ie.invoice_id
                         WHERE ie.engagement_id = e.id AND i.status = ANY($${wipParams.length + 1}::text[])), 0)::float8 AS billed
         FROM engagements e
         LEFT JOIN clients c ON c.id = e.client_id
         LEFT JOIN service_types st ON st.id = e.service_type_id
         LEFT JOIN task_instances ti ON ti.engagement_id = e.id
        WHERE e.status IN ('active', 'in_progress', 'on_hold', 'completed') AND e.agreed_fee IS NOT NULL AND e.agreed_fee > 0 AND COALESCE(e.fee_basis, '') <> 'per_visit' ${wipEntity}
        GROUP BY e.id, c.name, st.name`,
      [...wipParams, RAISED],
    );

    const unbilledRows = wipRows
      .map((r) => {
        const wip = Math.round(r.agreed_fee * (r.progress_pct / 100) * 100) / 100;
        const unbilled = Math.round(Math.max(0, wip - r.billed) * 100) / 100;
        return { ...r, wip_value: wip, unbilled };
      })
      .filter((r) => r.unbilled > 0)
      .sort((a, b) => b.unbilled - a.unbilled);

    const billedAmount = Number(billed[0]?.amount ?? 0);
    const collectedAmount = Number(collected[0]?.amount ?? 0);
    return NextResponse.json({
      wip: {
        amount: Math.round(unbilledRows.reduce((s, r) => s + r.unbilled, 0) * 100) / 100,
        engagements: unbilledRows.length,
      },
      billed_month: { amount: billedAmount, count: Number(billed[0]?.n ?? 0) },
      collected: {
        amount: collectedAmount,
        realisation_pct: billedAmount > 0 ? Math.round((collectedAmount / billedAmount) * 1000) / 10 : null,
      },
      overdue_60: {
        amount: Math.round(overdue.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
        clients: new Set(overdue.map((r) => r.client_id)).size,
      },
      unbilled_rows: unbilledRows,
    });
  } catch (err: unknown) {
    console.error("GET /api/invoices/summary error:", err);
    return NextResponse.json({ error: "The billing summary couldn't be loaded." }, { status: 500 });
  }
}
