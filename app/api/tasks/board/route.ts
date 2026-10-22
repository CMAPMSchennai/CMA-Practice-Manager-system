/**
 * GET /api/tasks/board?month=YYYY-MM&mine=1  (FR-49, FR-53, FR-81)
 * The task board grouped by engagement, with the four task tiles.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { getAutomationSettings } from "@/lib/app-settings";
import { buildTaskBoard } from "@/lib/task-board";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_tasks");
    const sp = req.nextUrl.searchParams;
    const month = sp.get("month") ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "month must be in YYYY-MM format." }, { status: 422 });
    }
    // Doers see their own work first; everyone can switch to all they may see.
    const doerRole = ["articled_clerk", "paid_assistant"].includes(user.roleName);
    const mineParam = sp.get("mine");
    const mine = mineParam === null ? doerRole : mineParam === "1";

    const [scope, settings] = await Promise.all([getAccessScope(user.id, user.roleName), getAutomationSettings()]);
    const board = await buildTaskBoard({
      month,
      mine,
      userId: user.id,
      scope,
      targetDays: settings.turnaround_target_days,
    });
    return NextResponse.json({ month, mine, doer_role: doerRole, ...board });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/tasks/board error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `The task board could not be loaded. (${detail.slice(0, 200)})` },
      { status: 500 },
    );
  }
}
