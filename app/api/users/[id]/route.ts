/**
 * GET /api/users/:id — returns a user profile by ID
 * AC: US001-AC-2 — 200 with { is_active, last_active_at, entity_access_scope }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

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
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: rows[0] });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Role and activation changes go through PATCH /api/settings/users/:id, which
 * enforces manage_users, the Managing Partner guard and the audit trail.
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Use PATCH /api/settings/users/:id to update a user" },
    { status: 405 },
  );
}
