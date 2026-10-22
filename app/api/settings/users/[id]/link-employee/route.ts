/**
 * POST /api/settings/users/:id/link-employee — link an existing login to an employee record (Gap #16b).
 *
 * Body: { employee_id }
 * For logins created before Gap #14 (sign-up or manual). Links both sides
 * (users.employee_id and employees.user_id) so the user appears in task
 * assignment and payroll readiness. One login per employee, one employee per
 * login. Requires manage_users.
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
    const body = (await req.json().catch(() => ({}))) as { employee_id?: unknown };
    const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
    if (!employeeId) {
      return NextResponse.json({ error: "employee_id is required" }, { status: 422 });
    }

    const users = await query<{ id: string; email: string | null; employee_id: string | null }>(
      `SELECT id, email, employee_id FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    const user = users[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userAlreadyLinked = await query<{ id: string }>(
      `SELECT id FROM employees WHERE user_id = $1 OR id = $2 LIMIT 1`,
      [user.id, user.employee_id],
    );
    if (user.employee_id || userAlreadyLinked.length > 0) {
      return NextResponse.json(
        { error: "This login is already linked to an employee" },
        { status: 409 },
      );
    }

    const employees = await query<{
      id: string;
      user_id: string | null;
      status: string;
      employee_id_code: string;
    }>(
      `SELECT id, user_id, status, employee_id_code FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    const employee = employees[0];
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const employeeTaken = await query<{ id: string }>(
      `SELECT id FROM users WHERE employee_id = $1 LIMIT 1`,
      [employee.id],
    );
    if (employee.user_id || employeeTaken.length > 0) {
      return NextResponse.json(
        { error: "This employee already has a login" },
        { status: 409 },
      );
    }
    if (employee.status === "resigned" || employee.status === "terminated") {
      return NextResponse.json(
        { error: `Cannot link an employee who has ${employee.status}` },
        { status: 422 },
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE users SET employee_id = $1 WHERE id = $2`, [employee.id, user.id]);
      await client.query(
        `UPDATE employees SET user_id = $1, updated_at = now() WHERE id = $2`,
        [user.id, employee.id],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: "link_employee",
      entity_type: "user",
      entity_id: user.id,
      field_changes: {
        employee_id: { before: null, after: employee.id },
        employee_code: { before: null, after: employee.employee_id_code },
      },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true, user_id: user.id, employee_id: employee.id });
  } catch (err: unknown) {
    console.error("POST /api/settings/users/:id/link-employee error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
