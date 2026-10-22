/**
 * GET   /api/clients/:id/checklist  the nine onboarding items with progress (FR-34)
 * PATCH /api/clients/:id/checklist  { code, complete }  tick or untick a manual item
 *
 * "Partner-in-charge assigned" and "Conflict-of-interest check passed" can't be
 * ticked by hand: the first follows the client record, the second is set when a
 * Partner records the conflict check.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";
import { MANUAL_CODES, checklistLabel, getChecklist } from "@/lib/client-checklist";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!(await userHasPermission(session.id, "view_clients"))) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: clientId } = await params;
    if (!(await canSeeClient(await getAccessScope(session.id), clientId))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const clientRows = await query<{ id: string }>(`SELECT id FROM clients WHERE id = $1 LIMIT 1`, [clientId]);
    if (clientRows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const [items, canEdit, canOverride, roleRows] = await Promise.all([
      getChecklist(clientId),
      userHasPermission(session.id, "edit_clients"),
      userHasPermission(session.id, "onboarding_override"),
      query<{ name: string }>(
        `SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
        [session.id],
      ),
    ]);
    const role = roleRows[0]?.name ?? "";
    return NextResponse.json({
      items,
      can_edit: canEdit,
      can_override: canOverride,
      can_record_conflict: role === "managing_partner" || role === "partner",
    });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
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
    if (!(await userHasPermission(session.id, "edit_clients"))) {
      return NextResponse.json({ error: "You do not have permission to edit clients" }, { status: 403 });
    }
    const { id: clientId } = await params;
    if (!(await canSeeClient(await getAccessScope(session.id), clientId))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { code?: string; complete?: boolean };
    const code = body.code ?? "";
    if (!MANUAL_CODES.includes(code)) {
      return NextResponse.json(
        {
          error:
            code === "conflict_check_passed"
              ? "The conflict check is recorded by a Partner using Conflict Check."
              : code === "partner_assigned"
                ? "This follows the Partner in Charge on the client record."
                : "Unknown checklist item.",
        },
        { status: 422 },
      );
    }
    const complete = body.complete === true;

    await getChecklist(clientId); // makes sure the rows exist
    await query(
      `UPDATE onboarding_checklist_items
          SET is_complete = $3,
              completed_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
              completed_at = CASE WHEN $3 THEN now() ELSE NULL END,
              override_by = CASE WHEN $3 THEN override_by ELSE NULL END,
              override_justification = CASE WHEN $3 THEN override_justification ELSE NULL END,
              updated_at = now()
        WHERE owner_type = 'client' AND owner_id = $1 AND checklist_item_code = $2`,
      [clientId, code, complete, session.id],
    );

    await createAuditLog({
      action: "checklist_update",
      entity_type: "clients",
      entity_id: clientId,
      field_changes: { [checklistLabel(code) ?? code]: { before: !complete, after: complete } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
