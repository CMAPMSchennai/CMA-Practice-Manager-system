/**
 * GET /api/today — the "Today" start section on the dashboard (UI Version 3).
 * Read-only. Shows only tasks the user may already see (FR-03).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { buildToday } from "@/lib/today";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_dashboard");
    const scope = await getAccessScope(user.id, user.roleName);
    return NextResponse.json(await buildToday(user.id, scope));
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/today error:", err);
    return NextResponse.json({ error: "Today couldn't be loaded. Please try again." }, { status: 500 });
  }
}
