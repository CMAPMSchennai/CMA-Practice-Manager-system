/**
 * POST   /api/settings/roles/:id/clone — clone a role (Managing Partner only)
 * DELETE /api/settings/roles/:id/clone — delete a custom role (Managing Partner only)
 *
 * AC: US029-AC-1 — POST clone → 201 with { id, is_custom: true, cloned_from }
 * AC: US029-AC-2 — DELETE seeded → 422
 * AC: US029-AC-3 — POST clone → 403 if not MP
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName, normalizePermissions } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireManagingPartner(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const roleName = await getUserRoleName(session.id);
  if (roleName !== "managing_partner") {
    return {
      error: NextResponse.json(
        { error: "Only Managing Partner can manage roles" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireManagingPartner(req);
    if (gate.error) return gate.error;
    const session = gate.session;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Source role not found" }, { status: 404 });
    }

    const sourceRoles = await query<{
      id: string;
      name: string;
      description: string | null;
      permissions: Record<string, boolean> | string;
    }>(
      `SELECT id, name, description, permissions FROM roles WHERE id = $1 LIMIT 1`,
      [id],
    );
    const sourceRole = sourceRoles[0];
    if (!sourceRole) {
      return NextResponse.json({ error: "Source role not found" }, { status: 404 });
    }

    const sourcePerms =
      typeof sourceRole.permissions === "string"
        ? (JSON.parse(sourceRole.permissions) as Record<string, boolean>)
        : sourceRole.permissions;

    let customName = `${sourceRole.name}_clone`;
    try {
      const body = await req.json();
      if (typeof body.name === "string" && body.name.trim()) {
        customName = body.name.trim();
      }
    } catch {
      // No body provided, use default name
    }

    const nameTaken = await query<{ id: string }>(
      `SELECT id FROM roles WHERE name = $1 LIMIT 1`,
      [customName],
    );
    if (nameTaken.length > 0) {
      return NextResponse.json(
        { error: `A role named '${customName}' already exists` },
        { status: 409 },
      );
    }

    // A clone is never managing_partner, so hard-locked actions are stripped.
    const clonedPerms = normalizePermissions(customName, sourcePerms, false);

    const cloned = await query<{
      id: string;
      name: string;
      description: string | null;
      permissions: Record<string, boolean>;
      is_seeded: boolean;
      is_custom: boolean;
      cloned_from: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO roles (name, description, permissions, is_seeded, is_custom, cloned_from)
       VALUES ($1, $2, $3, false, true, $4)
       RETURNING id, name, description, permissions, is_seeded, is_custom, cloned_from, created_at, updated_at`,
      [customName, sourceRole.description, JSON.stringify(clonedPerms), sourceRole.id],
    );
    const newRole = cloned[0];

    await createAuditLog({
      action: "create",
      entity_type: "roles",
      entity_id: newRole.id,
      field_changes: {
        cloned_from: { before: null, after: sourceRole.id },
        name: { before: null, after: customName },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ role: newRole }, { status: 201 });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireManagingPartner(req);
    if (gate.error) return gate.error;
    const session = gate.session;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const roles = await query<{ id: string; is_seeded: boolean; name: string }>(
      `SELECT id, is_seeded, name FROM roles WHERE id = $1 LIMIT 1`,
      [id],
    );
    const role = roles[0];
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    if (role.is_seeded) {
      return NextResponse.json(
        { error: "Seeded roles cannot be deleted" },
        { status: 422 },
      );
    }

    const assigned = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM users WHERE role_id = $1`,
      [id],
    );
    const assignedCount = parseInt(assigned[0]?.n ?? "0", 10);
    if (assignedCount > 0) {
      return NextResponse.json(
        { error: `Role is assigned to ${assignedCount} user(s). Reassign them before deleting.` },
        { status: 422 },
      );
    }

    await query(`DELETE FROM roles WHERE id = $1 AND is_seeded = false`, [id]);

    await createAuditLog({
      action: "delete",
      entity_type: "roles",
      entity_id: id,
      field_changes: { name: { before: role.name, after: null } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
