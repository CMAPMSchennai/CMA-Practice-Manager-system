/**
 * POST /api/settings/users/invite — create a staff login from an employee record (Gap #14).
 *
 * Body: { employee_id, role_id }
 * Creates the user with the chosen role, links it to the employee, and returns a
 * one-time password (valid 24 hours) that is shown to the admin once. The user
 * must set their own password on first login. Requires manage_users.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { issueTempPassword } from "@/lib/temp-password";
import { loginUrlFor, managingPartnerGuardError } from "@/lib/user-admin";
import { emailLoginDetails } from "@/lib/login-email";
import { getExtras } from "@/lib/record-extras";
import { loginAddressFor } from "@/lib/login-address";

export async function POST(req: NextRequest) {
  let actorId: string;
  try {
    const actor = await requirePermission(req, "manage_users");
    actorId = actor.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      employee_id?: unknown;
      role_id?: unknown;
      send_email?: unknown;
    };
    const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
    const roleId = typeof body.role_id === "string" ? body.role_id : "";
    if (!employeeId || !roleId) {
      return NextResponse.json(
        { error: "employee_id and role_id are required" },
        { status: 422 },
      );
    }

    const employees = await query<{
      id: string;
      first_name: string;
      last_name: string | null;
      email: string | null;
      personal_email: string | null;
      status: string;
      user_id: string | null;
    }>(
      `SELECT id, first_name, last_name, email, personal_email, status, user_id
         FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    const employee = employees[0];
    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    if (employee.user_id) {
      return NextResponse.json(
        { error: "This employee already has a login. Issue a new one-time password instead." },
        { status: 409 },
      );
    }
    if (employee.status === "resigned" || employee.status === "terminated") {
      return NextResponse.json(
        { error: `Cannot create a login for an employee who has ${employee.status}` },
        { status: 422 },
      );
    }
    const extras = await getExtras("employee", employee.id);
    const address = loginAddressFor({
      email: employee.email,
      personal_email: employee.personal_email,
      imported_personal_email: extras?.fields?.["Personal Email ID"],
    });
    if (!address) {
      return NextResponse.json(
        { error: "Add the employee's official or personal email address before creating a login" },
        { status: 422 },
      );
    }
    const email = address.email;

    const roles = await query<{ id: string; name: string }>(
      `SELECT id, name FROM roles WHERE id = $1 LIMIT 1`,
      [roleId],
    );
    const role = roles[0];
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 422 });
    }
    const guardError = await managingPartnerGuardError(actorId, role.id);
    if (guardError) {
      return NextResponse.json({ error: guardError }, { status: 403 });
    }

    const existingUser = await query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: `A login already exists for ${email}. Link or reset it from Settings → Users.` },
        { status: 409 },
      );
    }

    const fullName = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
    const client = await pool.connect();
    let userId: string;
    let issued: { password: string; expiresAt: string };
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, name, role, role_id, employee_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        [email, fullName, role.name, role.id, employee.id],
      );
      userId = inserted.rows[0].id;
      await client.query(
        `UPDATE employees SET user_id = $1, updated_at = now() WHERE id = $2`,
        [userId, employee.id],
      );
      issued = await issueTempPassword(client, userId);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: "create_login",
      entity_type: "user",
      entity_id: userId,
      field_changes: {
        employee_id: { before: null, after: employee.id },
        role: { before: null, after: role.name },
        login_email_source: { before: null, after: address.source },
        one_time_password_expires_at: { before: null, after: issued.expiresAt },
      },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    // Optionally email the same details to the person (added feature F5).
    const emailRequested = body.send_email === true;
    let emailResult: { ok: true } | { ok: false; error: string } | null = null;
    if (emailRequested) {
      emailResult = await emailLoginDetails({
        userId,
        actorId,
        to: email,
        name: fullName,
        roleName: role.name,
        password: issued.password,
        expiresAt: issued.expiresAt,
        loginUrl: loginUrlFor(req),
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json(
      {
        user_id: userId,
        email,
        role: role.name,
        temporary_password: issued.password,
        expires_at: issued.expiresAt,
        login_url: loginUrlFor(req),
        email_requested: emailRequested,
        emailed: emailResult?.ok === true,
        email_error: emailResult && !emailResult.ok ? emailResult.error : undefined,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("POST /api/settings/users/invite error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
