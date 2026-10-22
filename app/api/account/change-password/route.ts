/**
 * POST /api/account/change-password — the signed-in user sets their own password.
 *
 * Used on first login after an admin-issued one-time password (Gap #14):
 * body { current_password, new_password }. current_password is the one-time
 * password; it is refused once its 24-hour window has passed.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { pool, query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/audit";
import { clearPasswordChangeRequirement, getPasswordChangeState } from "@/lib/temp-password";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { current_password?: unknown; new_password?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body handled below */
  }
  const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new password are required" },
      { status: 422 },
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 422 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the one-time password" },
      { status: 422 },
    );
  }

  try {
    const rows = await query<{ password_hash: string | null; is_active: boolean }>(
      `SELECT password_hash, is_active FROM users WHERE id = $1 LIMIT 1`,
      [session.id],
    );
    const user = rows[0];
    if (!user || user.is_active === false) {
      return NextResponse.json({ error: "Account is deactivated" }, { status: 401 });
    }

    const state = await getPasswordChangeState(session.id);
    if (state.required && state.expired) {
      return NextResponse.json(
        {
          error:
            "Your one-time password has expired. Ask an administrator to issue a new one.",
        },
        { status: 400 },
      );
    }

    if (!user.password_hash || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, session.id]);
      await clearPasswordChangeRequirement(client, session.id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: state.required ? "set_password_after_one_time" : "change_password",
      entity_type: "user",
      entity_id: session.id,
      field_changes: { password: { before: "[redacted]", after: "[redacted]" } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("POST /api/account/change-password error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
