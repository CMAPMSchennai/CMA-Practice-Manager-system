/**
 * Reset-password endpoint — SCAFFOLDING. Platform-managed.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  let body: { email?: string; token?: string; password?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const rawToken = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!email || !rawToken) {
    return NextResponse.json(
      { success: false, error: "Email and token required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const identifier = `password-reset:${email}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<{
      identifier: string;
      token: string;
      expires: Date;
    }>(
      `SELECT identifier, token, expires
         FROM verification_token
        WHERE identifier = $1 AND token = $2
        LIMIT 1
        FOR UPDATE`,
      [identifier, tokenHash],
    );
    const tokenRow = tokenResult.rows[0];

    if (!tokenRow) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "Invalid or already-used reset link" },
        { status: 400 },
      );
    }
    if (new Date(tokenRow.expires).getTime() < Date.now()) {
      await client.query(
        `DELETE FROM verification_token WHERE identifier = $1 AND token = $2`,
        [identifier, tokenHash],
      );
      await client.query("COMMIT");
      return NextResponse.json(
        {
          success: false,
          error: "Reset link has expired. Request a new one.",
        },
        { status: 400 },
      );
    }

    const password_hash = await bcrypt.hash(password, 10);
    const updateResult = await client.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2`,
      [password_hash, email],
    );
    if (!updateResult.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 },
      );
    }

    await client.query(
      `DELETE FROM verification_token WHERE identifier = $1 AND token = $2`,
      [identifier, tokenHash],
    );
    await client.query(
      `DELETE FROM sessions
        WHERE "userId" IN (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // eslint-disable-next-line no-console
    console.error("[auth/reset-password]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
