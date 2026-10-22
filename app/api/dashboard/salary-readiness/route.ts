/**
 * GET /api/dashboard/salary-readiness?period=YYYY-MM
 * US025-AC-2: Returns { ready_count, review_needed_count, on_hold_count }
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_payroll");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const period = sp.get("period"); // YYYY-MM

    if (!period) {
      return NextResponse.json(
        { error: "period (YYYY-MM) is required." },
        { status: 422 },
      );
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: "period must be in YYYY-MM format." },
        { status: 422 },
      );
    }

    const periodDate = `${period}-01`;

    const rows = await query<{
      salary_status: string;
      cnt: string;
    }>(
      `SELECT salary_status, COUNT(*)::text AS cnt
         FROM payroll_readiness
        WHERE period = $1::date
        GROUP BY salary_status`,
      [periodDate],
    );

    let ready_count = 0;
    let review_needed_count = 0;
    let on_hold_count = 0;

    for (const row of rows) {
      const n = Number(row.cnt);
      switch (row.salary_status) {
        case "ready":
          ready_count = n;
          break;
        case "review_needed":
          review_needed_count = n;
          break;
        case "on_hold":
          on_hold_count = n;
          break;
      }
    }

    return NextResponse.json({
      period,
      ready_count,
      review_needed_count,
      on_hold_count,
    });
  } catch (err: unknown) {
    console.error("GET /api/dashboard/salary-readiness error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
