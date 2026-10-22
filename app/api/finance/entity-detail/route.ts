import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

/* ------------------------------------------------------------------ */
/*  GET /api/finance/entity-detail?entity_id=:id&from=...&to=...      */
/*  The entries behind one entity's P&L: invoices raised, receipts    */
/*  collected and expenses booked, so each figure can be checked.     */
/* ------------------------------------------------------------------ */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_finance");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const entityId = sp.get("entity_id");
    const from = sp.get("from");
    const to = sp.get("to");
    if (!entityId || !from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      return NextResponse.json({ error: "entity_id, from and to (YYYY-MM-DD) are required." }, { status: 422 });
    }
    if (to < from) {
      return NextResponse.json({ error: "The end date is before the start date." }, { status: 422 });
    }

    const invoices = await query<Record<string, unknown>>(
      `SELECT i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date,
              c.name AS client_name, i.total_amount::float8 AS total_amount, i.status
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.billing_entity_id = $1::uuid
          AND i.invoice_date >= $2::date AND i.invoice_date <= $3::date
          AND i.status NOT IN ('cancelled','written_off')
        ORDER BY i.invoice_date DESC, i.invoice_number DESC
        LIMIT 500`,
      [entityId, from, to],
    );

    const receipts = await query<Record<string, unknown>>(
      `SELECT to_char(r.receipt_date, 'YYYY-MM-DD') AS receipt_date, i.invoice_number,
              c.name AS client_name, r.amount::float8 AS amount,
              COALESCE(r.tds_amount, 0)::float8 AS tds_amount, r.payment_mode
         FROM receipts r
         JOIN invoices i ON i.id = r.invoice_id
         LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.billing_entity_id = $1::uuid
          AND r.receipt_date >= $2::date AND r.receipt_date <= $3::date
        ORDER BY r.receipt_date DESC
        LIMIT 500`,
      [entityId, from, to],
    );

    const expenses = await query<Record<string, unknown>>(
      `SELECT to_char(ex.expense_date, 'YYYY-MM-DD') AS expense_date, ex.category,
              ex.description, ex.amount::float8 AS amount, COALESCE(ex.gst_amount, 0)::float8 AS gst_amount
         FROM expenses ex
        WHERE ex.entity_id = $1::uuid
          AND ex.expense_date >= $2::date AND ex.expense_date <= $3::date
        ORDER BY ex.expense_date DESC
        LIMIT 500`,
      [entityId, from, to],
    );

    return NextResponse.json({ invoices, receipts, expenses });
  } catch (err: unknown) {
    console.error("GET /api/finance/entity-detail error:", err);
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
