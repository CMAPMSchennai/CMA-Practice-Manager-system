/**
 * POST /api/settings/users/:id/temporary-password — issue a new one-time password (Gap #14).
 *
 * Used when a one-time password expired or a user forgot theirs. Replaces the
 * password, restarts the 24-hour window and forces a password change on next
 * login. Requires manage_users; a Managing Partner's login can only be reset by
 * a Managing Partner. Users change their own password on /change-password.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { issueTempPassword } from "@/lib/temp-password";
import { loginUrlFor, managingPartnerGuardError } from "@/lib/user-admin";
import { emailLoginDetails } from "@/lib/login-email";

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
        { error: "You cannot issue a one-time password for your own account" },
        { status: 422 },
      );
    }

    const reqBody = (await req.json().catch(() => ({}))) as { send_email?: unknown };
    const users = await query<{
      id: string;
      email: string | null;
      name: string | null;
      role_id: string | null;
      role_name: string | null;
      is_active: boolean;
    }>(
      `SELECT u.id, u.email, u.name, u.role_id, r.name AS role_name, u.is_active
         FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 LIMIT 1`,
      [id],
    );
    const target = users[0];
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!target.is_active) {
      return NextResponse.json(
        { error: "Reactivate this user before issuing a one-time password" },
        { status: 422 },
      );
    }
    const guardError = await managingPartnerGuardError(actorId, target.role_id);
    if (guardError) {
      return NextResponse.json({ error: guardError }, { status: 403 });
    }

    const client = await pool.connect();
    let issued: { password: string; expiresAt: string };
    try {
      await client.query("BEGIN");
      issued = await issueTempPassword(client, target.id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: "issue_one_time_password",
      entity_type: "user",
      entity_id: target.id,
      field_changes: {
        one_time_password_expires_at: { before: null, after: issued.expiresAt },
      },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    // Optionally email the new password to the person (added feature F5).
    const emailRequested = reqBody.send_email === true && !!target.email;
    let emailResult: { ok: true } | { ok: false; error: string } | null = null;
    if (emailRequested && target.email) {
      emailResult = await emailLoginDetails({
        userId: target.id,
        actorId,
        to: target.email,
        name: target.name,
        roleName: target.role_name,
        password: issued.password,
        expiresAt: issued.expiresAt,
        loginUrl: loginUrlFor(req),
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json({
      user_id: target.id,
      email: target.email,
      temporary_password: issued.password,
      expires_at: issued.expiresAt,
      login_url: loginUrlFor(req),
      email_requested: emailRequested,
      emailed: emailResult?.ok === true,
      email_error: emailResult && !emailResult.ok ? emailResult.error : undefined,
    });
  } catch (err: unknown) {
    console.error("POST /api/settings/users/:id/temporary-password error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
