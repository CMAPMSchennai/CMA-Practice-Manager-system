/**
 * GET /api/dashboard/overview?period=YYYY-MM — everything the Managing Partner
 * dashboard shows for one month (FR-16 to FR-23).
 * Finance figures need view_finance; the team strip and the overdue-task table
 * need view_payroll. Everyone with dashboard access gets the utilisation tile.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { buildOverview } from "@/lib/dashboard-overview";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_dashboard");
    const period = req.nextUrl.searchParams.get("period");
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json({ error: "period must be in YYYY-MM format." }, { status: 422 });
    }
    const [finance, team, scope] = await Promise.all([
      userHasPermission(user.id, "view_finance"),
      userHasPermission(user.id, "view_payroll"),
      getAccessScope(user.id, user.roleName),
    ]);
    const overview = await buildOverview(period, { finance, team, scope });
    return NextResponse.json(overview);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/dashboard/overview error:", err);
    return NextResponse.json({ error: "The dashboard couldn't be loaded. Please try again." }, { status: 500 });
  }
}
