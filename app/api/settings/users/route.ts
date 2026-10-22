/**
 * GET /api/settings/users
 * US028-AC-1: Paginated list of users with role_id, is_active, last_active_at
 * US028-AC-3 (negative): 403 for partner (no manage_users permission)
 * Role gate: manage_users (admin, managing_partner)
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const search = sp.get("search") ?? "";
    const isActive = sp.get("is_active");

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`,
      );
    }

    if (isActive !== null && isActive !== "") {
      values.push(isActive === "true");
      conditions.push(`u.is_active = $${values.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countRows = await query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM users u ${where}`,
      values,
    );
    const total = Number(countRows[0].cnt);

    // Fetch page
    values.push(limit);
    values.push(offset);

    const users = await query<{
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
      linked_employee_id: string | null;
      linked_employee_name: string | null;
      linked_employee_code: string | null;
      password_setup_pending: boolean;
    }>(
      `SELECT u.id, u.name, u.email, u.image, u.role, u.role_id,
              r.name AS role_name,
              u.employee_id, u.entity_access_scope,
              u.is_active, u.last_active_at,
              e.id AS linked_employee_id,
              NULLIF(trim(concat_ws(' ', e.first_name, e.last_name)), '') AS linked_employee_name,
              e.employee_id_code AS linked_employee_code,
              EXISTS (
                SELECT 1 FROM verification_token vt
                 WHERE vt.identifier = 'must-change-password:' || u.id::text
              ) AS password_setup_pending
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN LATERAL (
           SELECT id, first_name, last_name, employee_id_code
             FROM employees
            WHERE id = u.employee_id OR user_id = u.id
            LIMIT 1
         ) e ON true
         ${where}
         ORDER BY u.name ASC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    console.error("GET /api/settings/users error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}