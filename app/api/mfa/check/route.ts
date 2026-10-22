/**
 * POST /api/mfa/check { email, password }
 * Used by the sign-in screen: after the password is right, does this person
 * also need to type an authenticator code? Says "yes" only for a correct
 * password, so it reveals nothing to someone guessing passwords.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) return NextResponse.json({ needs_mfa: false });
    const rows = await query<{ password_hash: string | null; mfa_enabled: boolean }>(
      `SELECT password_hash, mfa_enabled FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    const u = rows[0];
    if (!u?.password_hash || !u.mfa_enabled) return NextResponse.json({ needs_mfa: false });
    const ok = await bcrypt.compare(password, u.password_hash);
    return NextResponse.json({ needs_mfa: ok });
  } catch {
    return NextResponse.json({ needs_mfa: false });
  }
}
