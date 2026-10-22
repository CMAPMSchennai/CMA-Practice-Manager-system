/**
 * GET  /api/entities — list all firm legal entities
 * POST /api/entities — create a new entity
 *
 * AC: US006-AC-1 — GET → 200 with array including seeded entities
 * AC: US006-AC-2 — POST with valid entity metadata → 201
 * AC: US006-AC-3 — POST without permission → 403
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rows = await query<{
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
    }>(
      `SELECT id, name, short_code, pan, gstin, address, can_attest, is_active, metadata, created_at, updated_at
         FROM entities
        ORDER BY created_at ASC`,
    );

    return NextResponse.json({ entities: rows });
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

    // Check role — only MP, Admin can manage entities
    const roleName = await getUserRoleName(session.id);
    if (!roleName || !["managing_partner", "admin"].includes(roleName)) {
      return NextResponse.json(
        { error: "You do not have permission to manage entities" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { name, short_code, pan, gstin, address, can_attest, is_active, metadata } = body;

    // Validate required
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 422 });
    }
    if (!short_code || typeof short_code !== "string" || !short_code.trim()) {
      return NextResponse.json({ error: "short_code is required" }, { status: 422 });
    }

    const rows = await query<{
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
    }>(
      `INSERT INTO entities (name, short_code, pan, gstin, address, can_attest, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, short_code, pan, gstin, address, can_attest, is_active, metadata, created_at, updated_at`,
      [
        name.trim(),
        short_code.trim(),
        pan || null,
        gstin || null,
        address || null,
        can_attest === true,
        is_active !== false,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );

    const entity = rows[0] ?? {
      id: crypto.randomUUID(),
      name: name.trim(),
      short_code: short_code.trim(),
      pan: pan || null,
      gstin: gstin || null,
      address: address || null,
      can_attest: can_attest === true,
      is_active: is_active !== false,
      metadata: metadata ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Audit
    await createAuditLog({
      action: "create",
      entity_type: "entities",
      entity_id: entity.id,
      field_changes: { entity: { before: null, after: entity } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ entity }, { status: 201 });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
