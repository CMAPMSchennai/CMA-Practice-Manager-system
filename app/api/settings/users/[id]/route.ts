/**
 * GET /api/settings/users/:id — get user detail (admin / managing_partner)
 * PATCH /api/settings/users/:id — update role_id, is_active, entity_access_scope
 * US028-AC-2: PATCH with { is_active: false } → 200; deactivated user gets 401 on next protected req
 * US028-AC-3 (negative): 403 for partner
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(req, "manage_users");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const { id } = await params;

    const rows = await query<{
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      role: string | null;
      role_id: string | null;
      role_name: string | null;
      employee_id: string | null;
      entity_access_scope: unknown;
      is_active: boolean;
      last_active_at: string | null;
      created_at: string;
    }>(
      `SELECT u.id, u.name, u.email, u.image, u.role, u.role_id,
              r.name AS role_name,
              u.employee_id, u.entity_access_scope,
              u.is_active, u.last_active_at, u.created_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
        LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: rows[0] });
  } catch (err: unknown) {
    console.error("GET /api/settings/users/:id error:", err);
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
  let actorId: string;
  try {
    const actor = await requirePermission(req, "manage_users");
    actorId = actor.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const { id } = await params;

    // Fetch current user before update (for audit before/after)
    const before = await query<{
      role_id: string | null;
      is_active: boolean;
      entity_access_scope: unknown;
    }>(
      `SELECT role_id, is_active, entity_access_scope FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (before.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { role_id, is_active, entity_access_scope } = body as {
      role_id?: string | null;
      is_active?: boolean;
      entity_access_scope?: unknown[] | null;
    };

    // Managing Partner guard: only an MP can grant or remove the MP role or
    // deactivate an MP, and the last active MP cannot be removed. When no
    // active MP exists yet, a user manager may appoint the first one.
    const mpRows = await query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'managing_partner' LIMIT 1`,
    );
    const mpRoleId = mpRows[0]?.id ?? null;
    if (mpRoleId) {
      const activeMps = await query<{ id: string }>(
        `SELECT id FROM users WHERE role_id = $1 AND is_active = true`,
        [mpRoleId],
      );
      const actorIsMp = activeMps.some((u) => u.id === actorId);
      const targetIsMp = before[0].role_id === mpRoleId;
      const grantsMp = role_id === mpRoleId && !targetIsMp;
      const removesMp =
        targetIsMp && ((role_id !== undefined && role_id !== mpRoleId) || is_active === false);

      if (grantsMp && !actorIsMp && activeMps.length > 0) {
        return NextResponse.json(
          { error: "Only a Managing Partner can assign the Managing Partner role" },
          { status: 403 },
        );
      }
      if (removesMp) {
        if (!actorIsMp) {
          return NextResponse.json(
            { error: "Only a Managing Partner can change another Managing Partner's access" },
            { status: 403 },
          );
        }
        const remaining = activeMps.filter((u) => u.id !== id).length;
        if (remaining === 0) {
          return NextResponse.json(
            { error: "Cannot remove the last active Managing Partner" },
            { status: 422 },
          );
        }
      }
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (role_id !== undefined) {
      // Validate role_id exists
      if (role_id !== null) {
        const roleCheck = await query<{ id: string }>(
          `SELECT id FROM roles WHERE id = $1 LIMIT 1`,
          [role_id],
        );
        if (roleCheck.length === 0) {
          return NextResponse.json(
            { error: `Role not found: ${role_id}` },
            { status: 422 },
          );
        }
      }
      values.push(role_id);
      setClauses.push(`role_id = $${values.length}`);
    }

    if (is_active !== undefined) {
      if (typeof is_active !== "boolean") {
        return NextResponse.json(
          { error: "is_active must be a boolean" },
          { status: 422 },
        );
      }
      values.push(is_active);
      setClauses.push(`is_active = $${values.length}`);
    }

    if (entity_access_scope !== undefined) {
      values.push(JSON.stringify(entity_access_scope));
      setClauses.push(`entity_access_scope = $${values.length}`);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
    }

    // Always update the updated_at timestamp if the column exists
    // (users table may not have updated_at — skip it to be safe)

    values.push(id);
    const updated = await query<{ id: string; is_active: boolean; role_id: string | null }>(
      `UPDATE users
          SET ${setClauses.join(", ")}
        WHERE id = $${values.length}
        RETURNING id, is_active, role_id`,
      values,
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Write audit log
    const afterRow = updated[0];
    const fieldChanges: Record<string, { before: unknown; after: unknown }> = {};
    if (role_id !== undefined) {
      fieldChanges.role_id = { before: before[0].role_id, after: afterRow.role_id };
    }
    if (is_active !== undefined) {
      fieldChanges.is_active = { before: before[0].is_active, after: afterRow.is_active };
    }
    if (entity_access_scope !== undefined) {
      fieldChanges.entity_access_scope = {
        before: before[0].entity_access_scope,
        after: entity_access_scope,
      };
    }
    await createAuditLog({
      action: "update_user",
      entity_type: "user",
      entity_id: id,
      user_id: actorId,
      field_changes: fieldChanges,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: afterRow.id,
        is_active: afterRow.is_active,
        role_id: afterRow.role_id,
      },
    });
  } catch (err: unknown) {
    console.error("PATCH /api/settings/users/:id error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
