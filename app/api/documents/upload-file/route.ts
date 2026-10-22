import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { canSeeDocumentOwner, getAccessScope } from "@/lib/access-scope";
import { dropboxFolderFor, MAX_UPLOAD_BYTES, uploadToDropbox } from "@/lib/dropbox-files";

/**
 * POST /api/documents/upload-file   (multipart: file, owner_type, owner_id, file_name)
 * Sends the file itself to Dropbox and returns the Dropbox path. The screen then
 * registers the document with POST /api/documents using that path as file_ref.
 */
export async function POST(req: NextRequest) {
  let user: { id: string; roleName: string };
  try {
    user = await requirePermission(req, "upload_documents");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const ownerType = String(form.get("owner_type") ?? "");
    const ownerId = String(form.get("owner_id") ?? "");
    const fileName = String(form.get("file_name") ?? "").trim();

    if (!(file instanceof File) || !ownerType || !ownerId || !fileName) {
      return NextResponse.json({ error: "Choose a file and try again." }, { status: 422 });
    }
    if (!["client", "employee", "engagement", "entity"].includes(ownerType)) {
      return NextResponse.json({ error: "owner_type must be one of: client, employee, engagement, entity." }, { status: 422 });
    }
    if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 422 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Please upload a smaller file.` },
        { status: 413 },
      );
    }

    // Same visibility rule as registering the document.
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all" || ownerType === "entity") {
      const canViewEmployees = await userHasPermission(user.id, "view_employees");
      if (!(await canSeeDocumentOwner(scope, ownerType, ownerId, canViewEmployees))) {
        return NextResponse.json({ error: "You can only add documents to clients and engagements you work on." }, { status: 403 });
      }
    }

    const folder = await dropboxFolderFor(ownerType, ownerId);
    if (!folder) return NextResponse.json({ error: "The client, job or person was not found." }, { status: 404 });

    const result = await uploadToDropbox(folder, fileName, await file.arrayBuffer());
    if (!result.ok) {
      return NextResponse.json({ error: `The file could not be saved to Dropbox: ${result.error}` }, { status: 500 });
    }
    return NextResponse.json({ file_ref: result.path });
  } catch (err: unknown) {
    console.error("POST /api/documents/upload-file error:", err);
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
