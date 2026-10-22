/**
 * GET  /api/employees/:id/checklist — fetch employee onboarding checklist items
 * PATCH /api/employees/:id/checklist — toggle a checklist item
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
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

    // Staff may read the checklist on their own record (Gap #47); everyone
    // else needs view_employees.
    const canView = await userHasPermission(session.id, "view_employees");
    if (!canView) {
      const own = (await userHasPermission(session.id, "view_own_employee"))
        ? await query<{ id: string }>(
            `SELECT id FROM employees WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [id, session.id],
          )
        : [];
      if (own.length === 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const items = await query(
      `SELECT id, checklist_item_code, label, is_complete, completed_at, notes
         FROM onboarding_checklist_items
        WHERE owner_type = 'employee' AND owner_id = $1
          AND checklist_item_code NOT LIKE 'legacy\\_%'
        ORDER BY created_at ASC`,
      [id],
    );

    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canEdit = await userHasPermission(session.id, "edit_employees");
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { checklist_item_code, is_complete, notes } = body;

    if (!checklist_item_code) {
      return NextResponse.json({ error: "checklist_item_code is required" }, { status: 422 });
    }

    await query(
      `UPDATE onboarding_checklist_items
          SET is_complete = $1,
              completed_by = $2,
              completed_at = CASE WHEN $1 THEN now() ELSE NULL END,
              notes = COALESCE($3, notes),
              updated_at = now()
        WHERE owner_type = 'employee' AND owner_id = $4 AND checklist_item_code = $5`,
      [is_complete, session.id, notes ?? null, id, checklist_item_code],
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
