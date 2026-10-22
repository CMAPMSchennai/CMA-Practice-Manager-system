/**
 * GET  /api/reference-data — list reference data filtered by type
 * POST /api/reference-data — create a new reference data entry
 *
 * AC: US005-AC-1 — GET ?type=fee_basis → 200 with array of { id, code, label, sort_order, is_active }
 * AC: US005-AC-2 — POST with { type, code, label, sort_order } → 201
 * AC: US005-AC-3 — POST without manage_reference_data permission → 403
 * AC: US005-AC-4 — POST with missing required fields → 422
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/** System-maintained rows (settings, library metadata, encrypted fields) — never listed or created here. */
const INTERNAL_TYPES = ["system_setting", "task_library_meta", "secure_field", "record_extra", "import_batch", "invoice_reminder", "library_version"];

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = req.nextUrl;
    const type = url.searchParams.get("type");
    if (type && INTERNAL_TYPES.includes(type)) {
      return NextResponse.json({ reference_data: [] });
    }

    let rows;
    if (type) {
      rows = await query<{
        id: string;
        type: string;
        code: string;
        label: string;
        sort_order: number;
        is_active: boolean;
        metadata: unknown;
      }>(
        `SELECT id, type, code, label, sort_order, is_active, metadata
           FROM reference_data
          WHERE type = $1
          ORDER BY sort_order ASC`,
        [type],
      );
    } else {
      rows = await query<{
        id: string;
        type: string;
        code: string;
        label: string;
        sort_order: number;
        is_active: boolean;
        metadata: unknown;
      }>(
        `SELECT id, type, code, label, sort_order, is_active, metadata
           FROM reference_data
          WHERE type <> ALL($1::text[])
          ORDER BY type ASC, sort_order ASC`,
        [INTERNAL_TYPES],
      );
    }

    return NextResponse.json({ reference_data: rows });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check role — only MP, Admin can manage reference data
    const roleName = await getUserRoleName(session.id);
    if (!roleName || !["managing_partner", "admin"].includes(roleName)) {
      return NextResponse.json(
        { error: "You do not have permission to manage reference data" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { type, code, label, sort_order, is_active, metadata } = body;

    // Validate required fields
    if (!type || typeof type !== "string" || !type.trim()) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 422 },
      );
    }
    if (INTERNAL_TYPES.includes(type.trim())) {
      return NextResponse.json(
        { error: "This type is managed by the system and can't be edited here" },
        { status: 422 },
      );
    }
    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: "code is required" },
        { status: 422 },
      );
    }
    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json(
        { error: "label is required" },
        { status: 422 },
      );
    }

    const sortOrder = typeof sort_order === "number" ? sort_order : 0;

    const rows = await query<{
      id: string;
      type: string;
      code: string;
      label: string;
      sort_order: number;
      is_active: boolean;
      metadata: unknown;
      created_at: string;
    }>(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, type, code, label, sort_order, is_active, metadata, created_at`,
      [
        type.trim(),
        code.trim(),
        label.trim(),
        sortOrder,
        is_active !== false,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );

    const record = rows[0] ?? {
      id: crypto.randomUUID(),
      type: type.trim(),
      code: code.trim(),
      label: label.trim(),
      sort_order: sortOrder,
      is_active: is_active !== false,
      metadata: metadata ?? null,
      created_at: new Date().toISOString(),
    };

    // Audit
    await createAuditLog({
      action: "create",
      entity_type: "reference_data",
      entity_id: record.id,
      field_changes: { record: { before: null, after: record } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ reference_data: record }, { status: 201 });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
