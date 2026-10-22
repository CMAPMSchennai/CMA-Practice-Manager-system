/**
 * PATCH /api/settings/roles/:id/permissions — update role permissions
 * AC: US002-AC-2 — 403 if non-MP tries to set hard-locked actions
 * AC: US002-AC-4 — 200 and audit_logs entry with before/after
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { ALL_ACTIONS, HARD_LOCKED_ACTIONS, getUserRoleName, normalizePermissions } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Get the caller's role name
    const callerRoleName = await getUserRoleName(session.id);

    // Only managing_partner can update permissions
    if (callerRoleName !== "managing_partner") {
      return NextResponse.json(
        { error: "Only Managing Partner can update role permissions" },
        { status: 403 },
      );
    }

    // Fetch current role
    const roles = await query<{
      id: string;
      name: string;
      permissions: Record<string, boolean>;
      is_seeded: boolean;
    }>(
      `SELECT id, name, permissions, is_seeded FROM roles WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (roles.length === 0) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const role = roles[0];
    let currentPerms = role.permissions;
    if (typeof currentPerms === "string") {
      try { currentPerms = JSON.parse(currentPerms); } catch { currentPerms = {}; }
    }

    // Check hard-locked actions: only managing_partner role can have them
    const requestedPerms = body as Record<string, boolean>;
    for (const action of HARD_LOCKED_ACTIONS) {
      if (requestedPerms[action] === true && role.name !== "managing_partner") {
        return NextResponse.json(
          { error: `Action '${action}' is hard-locked to Managing Partner role only` },
          { status: 403 },
        );
      }
    }

    const unknownKeys = Object.keys(requestedPerms).filter(
      (k) => !(ALL_ACTIONS as readonly string[]).includes(k),
    );
    if (unknownKeys.length > 0) {
      return NextResponse.json(
        { error: `Unknown permission key(s): ${unknownKeys.join(", ")}` },
        { status: 422 },
      );
    }
    if (Object.values(requestedPerms).some((v) => typeof v !== "boolean")) {
      return NextResponse.json(
        { error: "Permission values must be true or false" },
        { status: 422 },
      );
    }

    // Merge, then normalise to exactly ALL_ACTIONS
    const newPerms = normalizePermissions(role.name, { ...currentPerms, ...requestedPerms }, false);

    // Update the role
    const updated = await query<{
      id: string;
      name: string;
      permissions: Record<string, boolean>;
      updated_at: string;
    }>(
      `UPDATE roles SET permissions = $1, updated_at = now() WHERE id = $2
       RETURNING id, name, permissions, updated_at`,
      [JSON.stringify(newPerms), id],
    );

    // Create audit log entry
    await createAuditLog({
      action: "permission_change",
      entity_type: "roles",
      entity_id: id,
      field_changes: {
        permissions: { before: currentPerms, after: newPerms },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      role: updated.length > 0 ? updated[0] : { id, permissions: newPerms },
    });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
