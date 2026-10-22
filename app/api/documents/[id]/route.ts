/**
 * DELETE /api/documents/:id
 *
 * Removes a wrongly uploaded file from view. It is a soft delete: every version
 * of that file is switched off and the record is kept for the audit trail, so
 * nothing is lost. Who may delete:
 *   - the Managing Partner, Partners and Admin, any file they can see
 *   - the person who uploaded it, only while it is not yet verified
 * (added feature outside the PDF).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { canSeeDocumentOwner, getAccessScope } from "@/lib/access-scope";
import { createAuditLog } from "@/lib/audit";
import { getDocMeta, patchDocMeta } from "@/lib/document-meta";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "upload_documents");
    const { id } = await params;

    const rows = await query<{
      id: string;
      owner_type: string;
      owner_id: string;
      file_name: string;
      uploaded_by: string | null;
      is_active: boolean;
    }>(`SELECT id, owner_type, owner_id, file_name, uploaded_by, is_active FROM documents WHERE id = $1::uuid LIMIT 1`, [id]);
    const doc = rows[0];
    if (!doc || !doc.is_active) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all" || doc.owner_type === "entity") {
      const canViewEmployees = await userHasPermission(user.id, "view_employees");
      if (!(await canSeeDocumentOwner(scope, doc.owner_type, doc.owner_id, canViewEmployees))) {
        return NextResponse.json({ error: "Document not found." }, { status: 404 });
      }
    }

    const meta = (await getDocMeta([id])).get(id) ?? {};
    const privileged = ["managing_partner", "partner", "admin"].includes(user.roleName);
    const ownUnverified = doc.uploaded_by === user.id && !meta.verified_at && !meta.checked_at;
    if (!privileged && !ownUnverified) {
      return NextResponse.json(
        { error: "You can delete only a file you uploaded that the Manager has not checked yet. Ask a Partner to delete this one." },
        { status: 403 },
      );
    }

    await query(
      `UPDATE documents SET is_active = false
        WHERE owner_type = $1 AND owner_id = $2::uuid AND file_name = $3 AND is_active = true`,
      [doc.owner_type, doc.owner_id, doc.file_name],
    );
    await patchDocMeta(id, { deleted_at: new Date().toISOString(), deleted_by: user.id });

    await createAuditLog({
      action: "delete_document",
      entity_type: "document",
      entity_id: id,
      field_changes: {
        deleted: { before: false, after: true },
        file_name: { before: doc.file_name, after: null },
      },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("DELETE /api/documents/[id] error:", err);
    return NextResponse.json({ error: "The file couldn't be deleted. Please try again." }, { status: 500 });
  }
}
