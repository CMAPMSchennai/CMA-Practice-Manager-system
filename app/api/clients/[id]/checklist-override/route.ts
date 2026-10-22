/**
 * POST /api/clients/:id/checklist-override
 *
 * MP-only override for client onboarding checklist items.
 * US011-AC-4: non-MP roles (e.g. admin) → 403
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { checklistLabel } from "@/lib/client-checklist";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only managing_partner has onboarding_override permission
    const canOverride = await userHasPermission(session.id, "onboarding_override");
    if (!canOverride) {
      return NextResponse.json(
        { error: "Only the Managing Partner can override onboarding checklist items" },
        { status: 403 },
      );
    }

    const { id: clientId } = await params;

    // Validate client exists
    const clientRows = await query<{ id: string }>(
      `SELECT id FROM clients WHERE id = $1 LIMIT 1`,
      [clientId],
    );
    if (clientRows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = await req.json();
    const { checklist_item_code, justification } = body;

    if (!checklist_item_code) {
      return NextResponse.json(
        { error: "checklist_item_code is required" },
        { status: 422 },
      );
    }
    if (!justification || !justification.trim()) {
      return NextResponse.json(
        { error: "justification is required for override" },
        { status: 422 },
      );
    }
    const itemLabel = checklistLabel(String(checklist_item_code));
    if (!itemLabel) {
      return NextResponse.json({ error: "Unknown checklist item." }, { status: 422 });
    }

    // Upsert the checklist item override
    const rows = await query<{ id: string }>(
      `INSERT INTO onboarding_checklist_items
        (owner_type, owner_id, checklist_item_code, label, is_complete,
         completed_by, completed_at, override_by, override_justification)
       VALUES
        ('client', $1, $2, '${itemLabel.replace(/'/g, "''")}', true, $3, now(), $3, $4)
       ON CONFLICT (owner_type, owner_id, checklist_item_code) DO UPDATE SET
         is_complete = true,
         override_by = EXCLUDED.override_by,
         override_justification = EXCLUDED.override_justification,
         completed_by = EXCLUDED.completed_by,
         completed_at = now()
       RETURNING id`,
      [clientId, checklist_item_code, session.id, justification.trim()],
    );

    await createAuditLog({
      action: "checklist_override",
      entity_type: "clients",
      entity_id: clientId,
      field_changes: { [itemLabel]: { before: "open", after: `overridden: ${justification.trim()}` } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json(
      { override: { id: rows[0]?.id, checklist_item_code, overridden_by: session.id } },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
