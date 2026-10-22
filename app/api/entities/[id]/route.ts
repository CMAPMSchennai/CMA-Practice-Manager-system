/**
 * GET   /api/entities/:id — fetch a single entity by ID
 * PATCH /api/entities/:id — update an existing entity
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

interface EntityRow {
  id: string;
  name: string;
  short_code: string;
  pan: string | null;
  gstin: string | null;
  address: string | null;
  can_attest: boolean;
  is_active: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const rows = await query<EntityRow>(
      `SELECT id, name, short_code, pan, gstin, address, can_attest, is_active, metadata, created_at, updated_at
         FROM entities
        WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    return NextResponse.json({ entity: rows[0] });
  } catch (err: unknown) {
    console.error("GET /api/entities/[id] error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Role gate — only managing_partner or admin can update entities
    const roleName = await getUserRoleName(session.id);
    if (!roleName || !["managing_partner", "admin"].includes(roleName)) {
      return NextResponse.json(
        { error: "You do not have permission to manage entities" },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Fetch existing entity for audit diff
    const existing = await query<EntityRow>(
      `SELECT id, name, short_code, pan, gstin, address, can_attest, is_active, metadata, created_at, updated_at
         FROM entities
        WHERE id = $1`,
      [id],
    );

    if (existing.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const before = existing[0];
    const body = await req.json();

    // Build SET clause dynamically from allowed fields
    const allowedFields: Array<{ key: string; column: string; transform?: (v: unknown) => unknown }> = [
      { key: "name", column: "name", transform: (v) => (typeof v === "string" ? v.trim() : v) },
      { key: "short_code", column: "short_code", transform: (v) => (typeof v === "string" ? v.trim() : v) },
      { key: "pan", column: "pan", transform: (v) => v || null },
      { key: "gstin", column: "gstin", transform: (v) => v || null },
      { key: "address", column: "address", transform: (v) => v || null },
      { key: "can_attest", column: "can_attest" },
      { key: "is_active", column: "is_active" },
      { key: "metadata", column: "metadata", transform: (v) => (v ? JSON.stringify(v) : null) },
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const f of allowedFields) {
      if (f.key in body) {
        const val = f.transform ? f.transform(body[f.key]) : body[f.key];
        setClauses.push(`${f.column} = $${idx++}`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 422 },
      );
    }

    // Always bump updated_at
    setClauses.push(`updated_at = now()`);

    values.push(id);

    const updated = await query<EntityRow>(
      `UPDATE entities
          SET ${setClauses.join(", ")}
        WHERE id = $${idx}
        RETURNING id, name, short_code, pan, gstin, address, can_attest, is_active, metadata, created_at, updated_at`,
      values,
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const after = updated[0];

    // Audit log
    await createAuditLog({
      action: "update",
      entity_type: "entities",
      entity_id: after.id,
      field_changes: { entity: { before, after } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ entity: after });
  } catch (err: unknown) {
    console.error("PATCH /api/entities/[id] error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
