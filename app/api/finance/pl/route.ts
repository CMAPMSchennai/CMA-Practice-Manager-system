import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

/* ------------------------------------------------------------------ */
/*  GET /api/finance/pl?entity_id=:id&period=YYYY-MM                  */
/*  GET /api/finance/pl?entity_id=:id&from=YYYY-MM-DD&to=YYYY-MM-DD   */
/*  Per-entity P&L for a month, or for any date range (both ends      */
/*  included): a quarter, a financial year, or custom dates.          */
/*  Revenue = sum of receipts received in the period for invoices     */
/*  billed from this entity.                                          */
/*  Expenses = sum of expenses for this entity in the period.         */
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
    const period = sp.get("period"); // YYYY-MM
    const from = sp.get("from");
    const to = sp.get("to");

    if (!entityId || (!period && !(from && to))) {
      return NextResponse.json(
        { error: "entity_id and either period (YYYY-MM) or from and to (YYYY-MM-DD) are required." },
        { status: 422 },
      );
    }

    // Work out the date range: start (included) and end (excluded).
    let start: string;
    let endExclusive: string;
    let label: string;
    if (from && to) {
      if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
        return NextResponse.json({ error: "from and to must be in YYYY-MM-DD format." }, { status: 422 });
      }
      if (to < from) {
        return NextResponse.json({ error: "The end date is before the start date." }, { status: 422 });
      }
      start = from;
      const next = await query<{ d: string }>(`SELECT to_char($1::date + 1, 'YYYY-MM-DD') AS d`, [to]);
      endExclusive = next[0].d;
      label = `${from} to ${to}`;
    } else {
      if (!/^\d{4}-\d{2}$/.test(period as string)) {
        return NextResponse.json({ error: "period must be in YYYY-MM format." }, { status: 422 });
      }
      start = `${period}-01`;
      const next = await query<{ d: string }>(
        `SELECT to_char($1::date + INTERVAL '1 month', 'YYYY-MM-DD') AS d`,
        [start],
      );
      endExclusive = next[0].d;
      label = period as string;
    }

    // Validate entity exists
    const entityRows = await query<{ id: string; name: string }>(
      `SELECT id, name FROM entities WHERE id = $1 LIMIT 1`,
      [entityId],
    );
    if (entityRows.length === 0) {
      return NextResponse.json({ error: "Entity not found." }, { status: 422 });
    }

    // Revenue: receipts collected in the range for invoices billed from this entity
    const revenueRows = await query<{ total: string; tds: string }>(
      `SELECT COALESCE(SUM(r.amount), 0)::text AS total,
              COALESCE(SUM(r.tds_amount), 0)::text AS tds
         FROM receipts r
         JOIN invoices i ON i.id = r.invoice_id
        WHERE i.billing_entity_id = $1
          AND r.receipt_date >= $2::date
          AND r.receipt_date < $3::date`,
      [entityId, start, endExclusive],
    );

    // Invoiced revenue (invoices issued in the range)
    const invoicedRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(i.total_amount), 0)::text AS total
         FROM invoices i
        WHERE i.billing_entity_id = $1
          AND i.invoice_date >= $2::date
          AND i.invoice_date < $3::date
          AND i.status NOT IN ('cancelled','written_off')`,
      [entityId, start, endExclusive],
    );

    // Expenses for this entity in the range
    const expenseRows = await query<{ total: string; gst_total: string }>(
      `SELECT COALESCE(SUM(ex.amount), 0)::text AS total,
              COALESCE(SUM(ex.gst_amount), 0)::text AS gst_total
         FROM expenses ex
        WHERE ex.entity_id = $1
          AND ex.expense_date >= $2::date
          AND ex.expense_date < $3::date`,
      [entityId, start, endExclusive],
    );

    const revenue = Number(revenueRows[0].total);
    const invoicedRevenue = Number(invoicedRows[0].total);
    const expenses = Number(expenseRows[0].total);
    const expenseGst = Number(expenseRows[0].gst_total);
    const tdsDeducted = Number(revenueRows[0].tds);

    const netProfit = revenue - expenses;

    return NextResponse.json({
      entity_id: entityId,
      entity_name: entityRows[0].name,
      period: label,
      from: start,
      revenue,
      invoiced_revenue: invoicedRevenue,
      expenses,
      expense_gst: expenseGst,
      tds_deducted: tdsDeducted,
      net_profit: netProfit,
    });
  } catch (err: unknown) {
    console.error("GET /api/finance/pl error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
