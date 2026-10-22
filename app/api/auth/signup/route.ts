/**
 * Signup endpoint — SCAFFOLDING. Platform-managed.
 *
 * Creates a `users` row with the canonical NextAuth identity columns
 * + the platform's `role` extension column (default `user`).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

const PUBLIC_SIGNUP_ENABLED = process.env.PUBLIC_SIGNUP_ENABLED === "true";

export async function POST(req: NextRequest) {
  if (!PUBLIC_SIGNUP_ENABLED) {
    return NextResponse.json(
      { success: false, error: "Self-signup is disabled. Contact your admin." },
      { status: 403 },
    );
  }

  let body: { email?: string; password?: string; name?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body handled below */
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = body.name ? String(body.name).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "Valid email required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "An account with that email already exists" },
        { status: 409 },
      );
    }

    const password_hash = await bcrypt.hash(password, 10);

    const userCountRes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM users`,
    );
    const isFirstUser = userCountRes.rows[0]?.n === "0";
    const role = isFirstUser ? "admin" : "user";

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, name, password_hash, role],
    );
    const userId = inserted.rows[0].id;

    await client.query("COMMIT");
    return NextResponse.json(
      { success: true, data: { id: userId, email } },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const message =
      err instanceof Error ? err.message : "Internal server error";
    // eslint-disable-next-line no-console
    console.error("[auth/signup]", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
