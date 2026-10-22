/**
 * POST /api/statutory-due-dates/escalate — run the escalation ladder now (FR-67).
 * Partners and the Managing Partner (manage_compliance).
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { runEscalation } from "@/lib/escalation";

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_compliance");
    const result = await runEscalation();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
