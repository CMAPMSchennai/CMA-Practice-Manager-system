import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/task-libraries — list all task libraries
 * Requires: view_tasks permission
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_tasks");

    const rows = await query<{
      id: string;
      name: string;
      description: string | null;
      version: number;
      parent_template_id: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, description, version, parent_template_id, is_active, created_at, updated_at
       FROM task_libraries
       ORDER BY name ASC`
    );

    return NextResponse.json({ task_libraries: rows });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/task-libraries — create a new task library
 * Requires: create_tasks permission (managing_partner, partner, admin)
 * AC-1: 201 with { id, name, version: 1 }
 * AC-2: 403 for users without create_tasks
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "create_tasks");

    const body = await req.json();
    const { name, description, parent_template_id } = body as {
      name?: string;
      description?: string;
      parent_template_id?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 422 }
      );
    }

    const rows = await query<{
      id: string;
      name: string;
      version: number;
      description: string | null;
      parent_template_id: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO task_libraries (name, description, version, parent_template_id, is_active)
       VALUES ($1, $2, 1, $3, true)
       RETURNING id, name, version, description, parent_template_id, is_active, created_at, updated_at`,
      [name.trim(), description?.trim() || null, parent_template_id || null]
    );

    const created = rows[0];

    await createAuditLog({
      action: "create",
      entity_type: "task_library",
      entity_id: created.id,
      field_changes: { name: { before: null, after: created.name } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
