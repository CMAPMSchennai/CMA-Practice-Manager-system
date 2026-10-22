/**
 * POST /api/settings/users/:id/unlink-employee — undo the link between a login and a staff record.
 *
 * Frees the staff record so it can be linked to another login (for example a real login
 * replacing a test one). Nothing is deleted: the login, the staff record, and the tasks
 * assigned to the login all stay as they are. A login cannot unlink itself. Requires
 * manage_users. Added feature outside the PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function POST(
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
    if (id === actorId) {
      return NextResponse.json(
        { error: "You cannot unlink your own login. Ask another Managing Partner to do it." },
        { status: 403 },
      );
    }

    const users = await query<{ id: string; employee_id: string | null }>(
      `SELECT id, employee_id FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    const user = users[0];
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const employees = await query<{ id: string; employee_id_code: string }>(
      `SELECT id, employee_id_code FROM employees WHERE user_id = $1 OR id = $2 LIMIT 1`,
      [user.id, user.employee_id],
    );
    const employee = employees[0];
    if (!employee) {
      return NextResponse.json({ error: "This login is not linked to a staff record." }, { status: 409 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE users SET employee_id = NULL WHERE id = $1`, [user.id]);
      await client.query(
        `UPDATE employees SET user_id = NULL, updated_at = now() WHERE id = $1`,
        [employee.id],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: "unlink_employee",
      entity_type: "user",
      entity_id: user.id,
      field_changes: {
        employee_id: { before: employee.id, after: null },
        employee_code: { before: employee.employee_id_code, after: null },
      },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true, user_id: user.id, employee_id: employee.id });
  } catch (err: unknown) {
    console.error("POST /api/settings/users/:id/unlink-employee error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
