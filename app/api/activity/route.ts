/**
 * GET /api/activity — the live activity feed on the Managing Partner dashboard.
 * Firm-wide, so only the Managing Partner and Admin may read it.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { buildActivity } from "@/lib/activity-feed";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_dashboard");
    if (!["managing_partner", "admin"].includes(user.roleName)) {
      return NextResponse.json({ error: "The activity feed is for the Managing Partner and Admin." }, { status: 403 });
    }
    return NextResponse.json({ events: await buildActivity() });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/activity error:", err);
    return NextResponse.json({ error: "Activity couldn't be loaded. Please try again." }, { status: 500 });
  }
}
