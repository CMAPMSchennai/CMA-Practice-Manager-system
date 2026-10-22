/**
 * POST /api/migration/batches/:id/rollback — undo a workbook import (FR-83).
 * Removes the records it created and restores the values it changed.
 * Records already in use (a login, engagements) are kept and listed. MP and Admin.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { rollbackBatch } from "@/lib/workbook-import/apply";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actorId: string;
  try {
    const actor = await requirePermission(req, "manage_settings");
    actorId = actor.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  const { id } = await params;
  try {
    const result = await rollbackBatch(id, actorId);
    await createAuditLog({
      action: "delete",
      entity_type: "reference_data",
      entity_id: id,
      field_changes: { workbook_import_rollback: { before: null, after: { kept: result.kept.length } } },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || status === 409) {
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
    console.error("POST rollback error:", err);
    return NextResponse.json({ error: "The rollback couldn't be completed. Please try again." }, { status: 500 });
  }
}
