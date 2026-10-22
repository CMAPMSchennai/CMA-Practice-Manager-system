/**
 * GET /api/task-assignees — people who can be picked for a task.
 *   (default)       users who can currently be assigned tasks: active, linked to a
 *                   current employee, onboarding checklist complete (FR-42).
 *   ?for=reviewer   users whose role may review tasks (FR-51).
 * Used by the task panel and the partner's Reassign action (Gap #17).
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { listBlockedAssignees, listEligibleAssignees, listEligibleReviewers } from "@/lib/task-assignment";

export async function GET(req: NextRequest) {
  try {
    // Only those who assign work see the staff list (§4); doers don't need it.
    await requirePermission(req, "create_tasks");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
  try {
    if (req.nextUrl.searchParams.get("for") === "reviewer") {
      return NextResponse.json({ reviewers: await listEligibleReviewers() });
    }
    const assignees = await listEligibleAssignees();
    // ?diagnose=1 also says who can't be assigned yet, and why.
    if (req.nextUrl.searchParams.get("diagnose") === "1") {
      return NextResponse.json({ assignees, blocked: await listBlockedAssignees() });
    }
    return NextResponse.json({ assignees });
  } catch (err: unknown) {
    console.error("GET /api/task-assignees error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
