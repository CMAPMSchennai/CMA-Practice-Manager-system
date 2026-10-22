/**
 * GET /api/users — list all users (admin only)
 * Returns users joined with their role name for display in User Management.
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

    // Only admins can list all users
    const me = await query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [session.id],
    );
    if (me.length === 0 || me[0].role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await query<{
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      role: string;
      role_id: string | null;
      role_name: string | null;
      is_active: boolean;
      last_active_at: string | null;
      created_at: string;
    }>(
      `SELECT u.id, u.name, u.email, u.image, u.role, u.role_id,
              r.name AS role_name, u.is_active, u.last_active_at, u.created_at
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
        ORDER BY u.created_at ASC`,
    );

    return NextResponse.json({ users });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
