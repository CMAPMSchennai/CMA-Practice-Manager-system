import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { canSeeDocumentOwner, getAccessScope } from "@/lib/access-scope";
import { createAuditLog } from "@/lib/audit";
import { getDocMeta, patchDocMeta } from "@/lib/document-meta";
import { maybeRunDocumentExpiry } from "@/lib/document-expiry";
import { matchesRequiredName, suggestedFileName } from "@/lib/document-naming";
import { categoryMap, categoryOf } from "@/lib/document-types-store";
import { actionsFor, notifyUsers, teamManagers } from "@/lib/doc-verification";

/**
 * POST /api/documents
 * Register a document record after the file has been uploaded to Dropbox.
 * Returns 201 with { id, version: 1, owner_type, owner_id }.
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
    const body = await req.json();
    const {
      owner_type,
      owner_id,
      document_type,
      file_name,
      file_ref,
      file_size_bytes,
      mime_type,
      expiry_date,
    } = body;

    // Validation
    if (!owner_type || !owner_id || !file_name || !file_ref) {
      return NextResponse.json(
        { error: "owner_type, owner_id, file_name, and file_ref are required." },
        { status: 422 },
      );
    }

    if (!["client", "employee", "engagement", "entity"].includes(owner_type)) {
      return NextResponse.json(
        { error: "owner_type must be one of: client, employee, engagement, entity." },
        { status: 422 },
      );
    }

    // A document can only be filed against a client or engagement the user can see.
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all" || owner_type === "entity") {
      const canViewEmployees = await userHasPermission(user.id, "view_employees");
      if (!(await canSeeDocumentOwner(scope, owner_type, owner_id, canViewEmployees))) {
        return NextResponse.json(
          { error: "You can only add documents to clients and engagements you work on." },
          { status: 403 },
        );
      }
    }

    // Engagement documents must be named <engagement code>_<document type> (Gap #83).
    if (owner_type === "engagement") {
      const eng = await query<{ engagement_code: string }>(
        `SELECT engagement_code FROM engagements WHERE id = $1::uuid`,
        [owner_id],
      );
      const code = eng[0]?.engagement_code;
      if (!code) {
        return NextResponse.json({ error: "Engagement not found." }, { status: 404 });
      }
      if (typeof document_type !== "string" || !document_type.trim()) {
        return NextResponse.json(
          { error: "Choose a document type for an engagement document." },
          { status: 422 },
        );
      }
      if (!matchesRequiredName(String(file_name), code, document_type.trim())) {
        return NextResponse.json(
          {
            error: `The file name must be ${suggestedFileName(code, document_type.trim(), String(file_name))}. Rename the file and try again.`,
          },
          { status: 422 },
        );
      }
    }

    // Check if a prior version exists for same owner + file_name to auto-increment version
    const priorRows = await query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0) AS version
         FROM documents
        WHERE owner_type = $1 AND owner_id = $2 AND file_name = $3`,
      [owner_type, owner_id, file_name],
    );
    const newVersion = (priorRows[0]?.version ?? 0) + 1;

    // Soft-deactivate prior versions of the same file
    if (newVersion > 1) {
      await query(
        `UPDATE documents SET is_active = false
          WHERE owner_type = $1 AND owner_id = $2 AND file_name = $3`,
        [owner_type, owner_id, file_name],
      );
    }

    // The category is kept in the document's details: the document_type column only
    // accepts two old values, so it is left empty (see lib/document-meta.ts).
    const rows = await query<{
      id: string;
      version: number;
      owner_type: string;
      owner_id: string;
      created_at: string;
    }>(
      `INSERT INTO documents
         (owner_type, owner_id, document_type, file_name, file_ref,
          file_size_bytes, mime_type, uploaded_by, expiry_date, version, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       RETURNING id, version, owner_type, owner_id, created_at`,
      [
        owner_type,
        owner_id,
        null,
        file_name,
        file_ref,
        file_size_bytes ?? null,
        mime_type ?? null,
        user.id,
        expiry_date ?? null,
        newVersion,
      ],
    );

    const doc = rows[0];
    const metaPatch: Record<string, unknown> = {};
    if (typeof document_type === "string" && document_type.trim()) metaPatch.category = document_type.trim();
    if (typeof body.original_file_name === "string" && body.original_file_name.trim()) {
      metaPatch.original_name = body.original_file_name.trim().slice(0, 255);
    }
    if (Object.keys(metaPatch).length > 0) await patchDocMeta(doc.id, metaPatch);

    // A4: tell the Manager(s) on the job that a file is waiting for their check.
    if (owner_type === "engagement") {
      try {
        const mgrs = [...((await teamManagers([owner_id])).get(owner_id) ?? [])].filter((m) => m !== user.id);
        await notifyUsers(mgrs, `New file to check: ${file_name}`, `${file_name} was uploaded and is waiting for your check.`, {
          document_id: doc.id,
          owner_type,
          owner_id,
          step: "uploaded",
        });
      } catch (e) {
        console.error("upload notification failed:", e);
      }
    }

    await createAuditLog({
      action: "upload_document",
      entity_type: "document",
      entity_id: doc.id,
      field_changes: {
        created: {
          before: null,
          after: { owner_type, owner_id, file_name, version: doc.version },
        },
      },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json(
      {
        id: doc.id,
        version: doc.version,
        owner_type: doc.owner_type,
        owner_id: doc.owner_id,
        created_at: doc.created_at,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("POST /api/documents error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/documents
 * List documents for an owner (filter by owner_type + owner_id).
 */
export async function GET(req: NextRequest) {
  let user: { id: string; roleName: string };
  try {
    user = await requirePermission(req, "view_documents");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    await maybeRunDocumentExpiry();
    const sp = req.nextUrl.searchParams;
    const owner_type = sp.get("owner_type");
    const owner_id = sp.get("owner_id");
    const active_only = sp.get("active_only") !== "false";

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (owner_type) {
      conditions.push(`owner_type = $${idx++}`);
      params.push(owner_type);
    }
    if (owner_id) {
      conditions.push(`owner_id = $${idx++}`);
      params.push(owner_id);
    }
    if (active_only) {
      conditions.push(`d.is_active = true`);
    }

    // NFR-07: documents follow the visibility of their owner (FR-03).
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.roleName !== "managing_partner" && owner_type !== "entity") {
      // Entity documents are for the Managing Partner only (Gap #63).
      conditions.push(`d.owner_type <> 'entity'`);
    }
    if (scope.mode !== "all" || owner_type === "entity") {
      if (owner_type && owner_id) {
        const canViewEmployees = await userHasPermission(user.id, "view_employees");
        if (!(await canSeeDocumentOwner(scope, owner_type, owner_id, canViewEmployees))) {
          return NextResponse.json({ documents: [] });
        }
      } else {
        // Without a specific owner, only documents the user uploaded.
        conditions.push(`uploaded_by = $${idx++}`);
        params.push(user.id);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT d.*, u.name AS uploaded_by_name
         FROM documents d
         LEFT JOIN users u ON u.id = d.uploaded_by
        ${where}
        ORDER BY d.created_at DESC
        LIMIT 200`,
      params,
    );

    const meta = await getDocMeta(rows.map((r) => String(r.id)));
    const cats = await categoryMap();
    const privileged = ["managing_partner", "partner", "admin"].includes(user.roleName);
    const managers = await teamManagers(
      rows.filter((r) => r.owner_type === "engagement").map((r) => String(r.owner_id)),
    );
    const documents = rows.map((r) => {
      const m = meta.get(String(r.id)) ?? {};
      return {
        ...r,
        // A clerk can't delete their own file once the Manager has checked it (A4).
        can_delete: privileged || (r.uploaded_by === user.id && !m.verified_at && !m.checked_at),
        actions: actionsFor(user.id, user.roleName, { owner_type: String(r.owner_type), owner_id: String(r.owner_id) }, m, managers),
        checked: !!m.checked_at,
        checked_by_name: m.checked_by_name ?? null,
        checked_at: m.checked_at ?? null,
        peer_name: m.peer_name ?? null,
        peer_id: m.peer_id ?? null,
        peer_done_at: m.peer_done_at ?? null,
        manager_on_job: r.owner_type === "engagement" && (managers.get(String(r.owner_id))?.size ?? 0) > 0,
        document_type: m.category ?? null,
        // The PDF's category (KYC, Banking...), worked out from the type.
        pdf_category: categoryOf(cats, m.category),
        verified: !!m.verified_at,
        verified_by_name: m.verified_by_name ?? null,
        verified_at: m.verified_at ?? null,
      };
    });

    const canVerify = ["managing_partner", "admin", "manager"].includes(user.roleName);
    // Other Managing Partners, for the optional peer review.
    const peers =
      user.roleName === "managing_partner"
        ? (
            await query<{ id: string; name: string }>(
              `SELECT u.id, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
                 FROM users u JOIN roles r ON r.id = u.role_id
                WHERE r.name = 'managing_partner' AND u.is_active = true AND u.id <> $1::uuid`,
              [user.id],
            )
          )
        : [];
    return NextResponse.json({ documents, can_verify: canVerify, peers });
  } catch (err: unknown) {
    console.error("GET /api/documents error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
