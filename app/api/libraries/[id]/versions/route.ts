/**
 * POST /api/libraries/:id/versions  { base_version, note, ops }  (FR-09)
 *
 * Saves a set of changes as the next version of the library. Managing Partner
 * and Partners only. The note says why the change was made. Brand variants of
 * a base template get a new version too.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { LibraryEditError, saveLibraryVersion } from "@/lib/library-store";
import type { LibOp } from "@/lib/library-ops";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "view_tasks");
    if (!["managing_partner", "partner"].includes(user.roleName)) {
      return NextResponse.json({ error: "Only the Managing Partner or a Partner can edit a task library." }, { status: 403 });
    }
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { base_version?: number; note?: string; ops?: LibOp[] };
    const note = (body.note ?? "").trim();
    if (!note) return NextResponse.json({ error: "Write a short note on why you are changing this library." }, { status: 422 });
    if (!Array.isArray(body.ops) || body.ops.length === 0) {
      return NextResponse.json({ error: "There are no changes to save." }, { status: 422 });
    }
    if (body.ops.length > 500) {
      return NextResponse.json({ error: "Save fewer than 500 changes at a time." }, { status: 422 });
    }
    if (typeof body.base_version !== "number") {
      return NextResponse.json({ error: "base_version is required." }, { status: 422 });
    }

    const who = await query<{ name: string }>(
      `SELECT COALESCE(NULLIF(trim(name), ''), email) AS name FROM users WHERE id = $1 LIMIT 1`,
      [user.id],
    );
    const result = await saveLibraryVersion({
      libraryId: id,
      baseVersion: body.base_version,
      ops: body.ops,
      note,
      userId: user.id,
      userName: who[0]?.name ?? "",
    });

    await createAuditLog({
      action: "new_library_version",
      entity_type: "task_library",
      entity_id: id,
      field_changes: { version: { before: body.base_version, after: result.version } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof LibraryEditError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("POST /api/libraries/:id/versions error:", err);
    return NextResponse.json({ error: "The changes could not be saved." }, { status: 500 });
  }
}
