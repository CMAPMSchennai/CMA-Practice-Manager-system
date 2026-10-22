/**
 * GET /api/audit-logs/verify  checks the audit trail's hash chain (FR-02).
 * Needs view_audit_logs. Reports whether any entry was changed, removed or inserted.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { verifyAuditChain } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_audit_logs");
    return NextResponse.json(await verifyAuditChain());
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/audit-logs/verify error:", err);
    return NextResponse.json({ error: "The audit trail could not be checked." }, { status: 500 });
  }
}
