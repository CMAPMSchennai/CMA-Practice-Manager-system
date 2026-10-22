/**
 * GET /api/settings/users/linkable-employees — employees with no login yet (Gap #16b).
 * Used by Settings → Users "Link to employee". Excludes resigned / terminated staff.
 * Requires manage_users.
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
    const employees = await query<{
      id: string;
      employee_id_code: string;
      name: string;
      email: string | null;
      position_type: string;
    }>(
      `SELECT e.id, e.employee_id_code,
              trim(concat_ws(' ', e.first_name, e.last_name)) AS name,
              e.email, e.position_type
         FROM employees e
        WHERE e.user_id IS NULL
          AND e.status NOT IN ('resigned', 'terminated')
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)
        ORDER BY e.first_name ASC, e.last_name ASC`,
    );
    return NextResponse.json({ employees });
  } catch (err: unknown) {
    console.error("GET /api/settings/users/linkable-employees error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
