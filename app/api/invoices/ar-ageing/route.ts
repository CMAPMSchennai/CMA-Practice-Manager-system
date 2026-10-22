import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { OPEN_STATUSES, SETTLED_SQL, markOverdueInvoices } from "@/lib/invoice-status";

/* ------------------------------------------------------------------ */
/*  GET /api/invoices/ar-ageing?billing_entity_id=:id   (FR-73)       */
/*  AR ageing buckets 0-30, 31-60, 61-90, over 90 days past due.       */
/*  Only issued invoices count; what is owed is the total less money   */
/*  received and TDS the client deducted.                              */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_billing");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    await markOverdueInvoices();

    const billingEntityId = req.nextUrl.searchParams.get("billing_entity_id");
    const params: unknown[] = [[...OPEN_STATUSES]];
    let entityFilter = "";
    if (billingEntityId) {
      params.push(billingEntityId);
      entityFilter = `AND i.billing_entity_id = $${params.length}`;
    }

    const rows = await query<{
      "0_30": string;
      "31_60": string;
      "61_90": string;
      over_90: string;
      total_outstanding: string;
      invoice_count: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN age_days BETWEEN 0 AND 30 THEN outstanding ELSE 0 END), 0) AS "0_30",
         COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN outstanding ELSE 0 END), 0) AS "31_60",
         COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN outstanding ELSE 0 END), 0) AS "61_90",
         COALESCE(SUM(CASE WHEN age_days > 90 THEN outstanding ELSE 0 END), 0) AS over_90,
         COALESCE(SUM(outstanding), 0) AS total_outstanding,
         COUNT(*) AS invoice_count
       FROM (
         SELECT i.id,
                (i.total_amount::float8 - ${SETTLED_SQL}) AS outstanding,
                GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)::date))::int AS age_days
           FROM invoices i
          WHERE i.status = ANY($1::text[]) ${entityFilter}
       ) sub
       WHERE outstanding > 0.01`,
      params,
    );

    const result = rows[0];
    return NextResponse.json({
      "0_30": Number(result["0_30"]),
      "31_60": Number(result["31_60"]),
      "61_90": Number(result["61_90"]),
      over_90: Number(result.over_90),
      total_outstanding: Number(result.total_outstanding),
      invoice_count: Number(result.invoice_count),
    });
  } catch (err: unknown) {
    console.error("GET /api/invoices/ar-ageing error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
