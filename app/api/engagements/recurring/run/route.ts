/**
 * POST /api/engagements/recurring/run — create the next period of every
 * recurring engagement that is due (FR-06, FR-55). Needs create_engagements.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { runRecurring } from "@/lib/recurring-engagements";

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "create_engagements");
    const result = await runRecurring(user.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
