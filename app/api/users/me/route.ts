/**
 * GET /api/users/me — returns the current authenticated user's profile
 * AC: US001-AC-3 — 401 if not authenticated
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const rows = await query<{
      id: string;
      name: string | null;
      email: string | null;
      role_id: string | null;
      employee_id: string | null;
      entity_access_scope: unknown;
      is_active: boolean;
      last_active_at: string | null;
      image: string | null;
    }>(
      `SELECT id, name, email, role_id, employee_id, entity_access_scope,
              is_active, last_active_at, image
         FROM users WHERE id = $1 LIMIT 1`,
      [session.id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = rows[0];

    // Update last_active_at
    await query(
      `UPDATE users SET last_active_at = now() WHERE id = $1`,
      [session.id],
    );

    return NextResponse.json({ user });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
