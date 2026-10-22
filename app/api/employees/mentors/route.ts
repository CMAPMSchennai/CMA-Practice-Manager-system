/**
 * GET /api/employees/mentors — the partners who can be named as a staff member's
 * mentor or as the firm's authorised signatory on the onboarding form.
 * Needs permission to create or edit employees.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const ok = (await userHasPermission(user.id, "create_employees")) || (await userHasPermission(user.id, "edit_employees"));
    if (!ok) return NextResponse.json({ error: "You do not have permission to view this." }, { status: 403 });
    const partners = await query<{ id: string; name: string }>(
      `SELECT u.id, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name IN ('managing_partner', 'partner') AND u.is_active = true
        ORDER BY name`,
    );
    return NextResponse.json({ partners });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load the partners." }, { status: 500 });
  }
}
