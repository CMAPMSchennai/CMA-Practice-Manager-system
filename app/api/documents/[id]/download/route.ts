import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { canSeeDocumentOwner, getAccessScope } from "@/lib/access-scope";
import { createAuditLog } from "@/lib/audit";
import { handleIntegrationAction } from "@/lib/integrations/connectors/handleIntegrationAction";

interface DocumentRow {
  id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  file_ref: string;
  uploaded_by: string;
  version: number;
  is_active: boolean;
  expiry_date: string | null;
}

/**
 * GET /api/documents/:id/download
 *
 * Returns a temporary download URL for a Dropbox-backed document.
 *
 * Access control:
 *   - Broad roles (managing_partner, partner, admin, manager) can download any document.
 *   - Narrow roles (paid_assistant, articled_clerk, …) can only download documents they
 *     uploaded OR where they are the partner_in_charge of the owning client.
 *
 * Audit log entry is written on every successful download (AC-2 requirement).
 *
 * AC-2: → 200 { download_url }
 * AC-3: articled_clerk on another client's doc → 403
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require view_documents permission (throws 401 if not authenticated, 403 if role lacking)
  let user: { id: string; roleName: string };
  try {
    user = await requirePermission(req, "view_documents");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  const { id } = await params;

  try {
    // Fetch the document record
    const rows = await query<DocumentRow>(
      `SELECT id, owner_type, owner_id, file_name, file_ref, uploaded_by, version, is_active, expiry_date
         FROM documents
        WHERE id = $1
        LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const doc = rows[0];

    // ----------------------------------------------------------------
    // Scope check: broad roles can access any document; narrow roles are
    // restricted to docs they uploaded OR their partner_in_charge client docs.
    // ----------------------------------------------------------------
    // NFR-07 / FR-03: access follows the document's owner (client, engagement or employee).
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all" || doc.owner_type === "entity") {
      const canViewEmployees = await userHasPermission(user.id, "view_employees");
      const allowed =
        (doc.owner_type !== "entity" && doc.uploaded_by === user.id) ||
        (await canSeeDocumentOwner(scope, doc.owner_type, doc.owner_id, canViewEmployees));
      if (!allowed) {
        return NextResponse.json(
          { error: "You do not have access to this document." },
          { status: 403 },
        );
      }
    }

    // ----------------------------------------------------------------
    // Call Dropbox via platform integration to get a temporary download link.
    // The platform handles credentials — never pass API keys here.
    // ----------------------------------------------------------------
    const result = await handleIntegrationAction(
      "dropbox",
      "filesgettemporarylink",
      { path: doc.file_ref },
      {
        method: "POST",
        endpoint: "/files/get_temporary_link",
        fields: [{ key: "path", location: "body" }],
      },
    );

    let download_url: string;

    if (!result.success) {
      // Dropbox not yet connected or call failed — return an empty-state response
      // rather than a fake URL. The UI handles the unconfigured state.
      console.warn("Dropbox filesgettemporarylink failed:", result.error);
      const why = String(result.error ?? "");
      const message = /not_found/i.test(why)
        ? "This file is not in Dropbox. It was registered before real uploads were switched on, so only its details exist. Upload it again."
        : `Dropbox could not open this file: ${why.slice(0, 200) || "no answer"}`;
      return NextResponse.json({ error: message }, { status: 500 });
    } else {
      const linkData = result.data as { link?: string } | null;
      download_url = linkData?.link ?? "";
    }

    // ----------------------------------------------------------------
    // Audit log — required by AC-2
    // ----------------------------------------------------------------
    await createAuditLog({
      action: "download_document",
      entity_type: "document",
      entity_id: doc.id,
      field_changes: null,
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json({
      download_url,
      file_name: doc.file_name,
      version: doc.version,
      expiry_date: doc.expiry_date,
    });
  } catch (err: unknown) {
    console.error("GET /api/documents/[id]/download error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
