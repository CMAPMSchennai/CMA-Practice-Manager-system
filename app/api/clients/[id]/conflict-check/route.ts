/**
 * GET /api/clients/:id/conflict-check — check for related-party conflicts
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";
import { clientsWithSamePan } from "@/lib/secure-fields";
import { createAuditLog } from "@/lib/audit";
import { CONFLICT_CODE, checklistLabel, getChecklist } from "@/lib/client-checklist";

/**
 * POST /api/clients/:id/conflict-check  { outcome, note }  (FR-35)
 * A Partner or the Managing Partner records the result with their name and the
 * date. outcome "clear" means nothing was found; "cleared_after_review" means
 * conflicts were found and the partner decided to proceed, which needs a note.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id: clientId } = await params;
    if (!(await canSeeClient(await getAccessScope(session.id), clientId))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const who = await query<{ role: string; name: string }>(
      `SELECT r.name AS role, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 LIMIT 1`,
      [session.id],
    );
    if (!who[0] || !["managing_partner", "partner"].includes(who[0].role)) {
      return NextResponse.json(
        { error: "Only a Partner or the Managing Partner can record the conflict-of-interest check." },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { outcome?: string; note?: string };
    const note = (body.note ?? "").trim();
    if (body.outcome !== "clear" && body.outcome !== "cleared_after_review") {
      return NextResponse.json({ error: "outcome must be clear or cleared_after_review." }, { status: 422 });
    }
    if (body.outcome === "cleared_after_review" && !note) {
      return NextResponse.json(
        { error: "Write a short note on why you are proceeding despite the conflicts found." },
        { status: 422 },
      );
    }

    const day = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    const text =
      (body.outcome === "clear" ? "No conflict found" : "Conflicts reviewed and cleared") +
      `. Checked by ${who[0].name} on ${day}` +
      (note ? `: ${note}` : ".");

    await getChecklist(clientId); // makes sure the rows exist
    await query(
      `UPDATE onboarding_checklist_items
          SET is_complete = true, completed_by = $2, completed_at = now(), notes = $3, updated_at = now()
        WHERE owner_type = 'client' AND owner_id = $1 AND checklist_item_code = $4`,
      [clientId, session.id, text, CONFLICT_CODE],
    );
    // Moves the client into the Conflict Check stage if it hasn't got that far.
    await query(
      `UPDATE clients SET onboarding_status = 'conflict_check', updated_at = now()
        WHERE id = $1 AND onboarding_status IN ('imported', 'kyc_and_docs')`,
      [clientId],
    );
    await createAuditLog({
      action: "conflict_check",
      entity_type: "clients",
      entity_id: clientId,
      field_changes: { [checklistLabel(CONFLICT_CODE) ?? CONFLICT_CODE]: { before: "open", after: text } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, recorded: text });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canView = await userHasPermission(session.id, "view_clients");
    if (!canView) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { id: clientId } = await params;
    if (!(await canSeeClient(await getAccessScope(session.id), clientId))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get this client's details
    const clientRows = await query<{
      id: string;
      name: string;
      pan: string | null;
      group_id: string | null;
      partner_in_charge_id: string | null;
    }>(
      `SELECT id, name, pan, group_id, partner_in_charge_id
         FROM clients WHERE id = $1 LIMIT 1`,
      [clientId],
    );

    if (clientRows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const client = clientRows[0];
    const conflicts: Array<{ client_name: string; group_name: string; reason: string }> = [];

    // Check 1: same group (related parties)
    if (client.group_id) {
      const sameGroup = await query<{ name: string; group_name: string }>(
        `SELECT c.name, cg.name as group_name
           FROM clients c
           LEFT JOIN client_groups cg ON cg.id = c.group_id
          WHERE c.group_id = $1 AND c.id != $2 AND c.is_active = true
          LIMIT 10`,
        [client.group_id, clientId],
      );
      for (const row of sameGroup) {
        conflicts.push({
          client_name: row.name,
          group_name: row.group_name,
          reason: "Same client group (related party)",
        });
      }
    }

    // Check 2: same PAN (if available). PANs are encrypted, so match on the
    // stored fingerprint (NFR field encryption).
    if (client.pan) {
      const samePanIds = await clientsWithSamePan(clientId, client.pan);
      const samePan = samePanIds.length
        ? await query<{ name: string }>(
            `SELECT name FROM clients
              WHERE id = ANY($1::uuid[]) AND is_active = true
              LIMIT 5`,
            [samePanIds],
          )
        : [];
      for (const row of samePan) {
        conflicts.push({
          client_name: row.name,
          group_name: "PAN match",
          reason: "Same PAN number — possible duplicate",
        });
      }
    }

    // Check 3: same partner in charge — warn if any existing conflict in that partner's book
    if (client.partner_in_charge_id) {
      const partnerClients = await query<{ name: string }>(
        `SELECT c.name FROM clients c
           JOIN clients conflict_c ON conflict_c.group_id = c.group_id
          WHERE c.partner_in_charge_id = $1
            AND conflict_c.id = $2
            AND c.id != $2
            AND c.group_id IS NOT NULL
          LIMIT 5`,
        [client.partner_in_charge_id, clientId],
      );
      for (const row of partnerClients) {
        conflicts.push({
          client_name: row.name,
          group_name: "Partner's book",
          reason: "Partner already manages a related-group client",
        });
      }
    }

    return NextResponse.json({
      has_conflict: conflicts.length > 0,
      conflicts,
    });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
