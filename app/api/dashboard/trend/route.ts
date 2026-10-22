/**
 * GET /api/dashboard/trend?period=YYYY-MM
 * Six months of firm figures for the dashboard charts. Finance access only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { buildTrend } from "@/lib/dashboard-trend";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_dashboard");
    const period = req.nextUrl.searchParams.get("period");
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json({ error: "period must be in YYYY-MM format." }, { status: 422 });
    }
    if (!(await userHasPermission(user.id, "view_finance"))) {
      return NextResponse.json({ error: "Firm finances are shown to the Managing Partner, Partners and Admin." }, { status: 403 });
    }
    const scope = await getAccessScope(user.id, user.roleName);
    return NextResponse.json({ months: await buildTrend(period, scope) });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/dashboard/trend error:", err);
    return NextResponse.json({ error: "The trend couldn't be loaded. Please try again." }, { status: 500 });
  }
}
