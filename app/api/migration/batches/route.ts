/**
 * GET /api/migration/batches — workbook import history (FR-83). MP and Admin.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { listBatches } from "@/lib/workbook-import/apply";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_settings");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
  try {
    return NextResponse.json({ batches: await listBatches() });
  } catch (err: unknown) {
    console.error("GET /api/migration/batches error:", err);
    return NextResponse.json({ error: "Import history couldn't be loaded" }, { status: 500 });
  }
}
