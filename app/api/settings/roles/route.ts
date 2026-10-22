/**
 * GET  /api/settings/roles — list all roles with permissions
 * AC: US002-AC-1 — 200 with array of 6 roles each containing permissions and hard_locked_actions
 * AC: US002-AC-3 — 401 if not authenticated
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { HARD_LOCKED_ACTIONS, ensureRolesSynced } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await ensureRolesSynced();

    const roles = await query<{
      id: string;
      name: string;
      description: string | null;
      permissions: Record<string, boolean>;
      is_seeded: boolean;
      is_custom: boolean;
      cloned_from: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, description, permissions, is_seeded, is_custom, cloned_from, created_at, updated_at
         FROM roles
        ORDER BY created_at ASC`,
    );

    // Add hard_locked_actions to each role
    const enriched = roles.map(role => {
      // Ensure permissions is an object
      let perms = role.permissions;
      if (typeof perms === "string") {
        try { perms = JSON.parse(perms); } catch { perms = {}; }
      }
      return {
        ...role,
        permissions: perms,
        hard_locked_actions: HARD_LOCKED_ACTIONS,
      };
    });

    return NextResponse.json({ roles: enriched });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
