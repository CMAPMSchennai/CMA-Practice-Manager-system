/**
 * GET   /api/clients/:id — get client detail
 * PATCH /api/clients/:id — update client
 * DELETE /api/clients/:id — soft-delete client
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";
import { decryptField } from "@/lib/field-crypto";
import { getExtras } from "@/lib/record-extras";
import { prepareClientPan, saveClientSecretMeta, secureFieldErrorResponse } from "@/lib/secure-fields";
import { createAuditLog } from "@/lib/audit";
import { openItems } from "@/lib/client-checklist";

/** FR-03: out-of-scope clients are reported as not found. */
async function clientOutOfScope(userId: string, clientId: string): Promise<boolean> {
  return !(await canSeeClient(await getAccessScope(userId), clientId));
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
      return NextResponse.json(
        { error: "You do not have permission to view clients" },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (await clientOutOfScope(session.id, id)) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const rows = await query(
      `SELECT c.*,
              cg.name as group_name,
              rd.label as entity_type_label
         FROM clients c
         LEFT JOIN client_groups cg ON cg.id = c.group_id
         LEFT JOIN reference_data rd ON rd.id = c.entity_type_id
        WHERE c.id = $1
        LIMIT 1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // PAN is stored encrypted (NFR).
    const client = rows[0] as Record<string, unknown>;
    // Workbook details without a column yet (Gaps #38, #40).
    const extras = await getExtras("client", id);
    return NextResponse.json({ client: { ...client, pan: decryptField(client.pan), extra_details: extras } });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
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

    const canEdit = await userHasPermission(session.id, "edit_clients");
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit clients" },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (await clientOutOfScope(session.id, id)) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    const body = await req.json();

    const existing = await query<{ id: string; onboarding_status: string }>(
      `SELECT id, onboarding_status FROM clients WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // FR-36: no activation until all nine checklist items are complete. The
    // Managing Partner can complete an item with a written, recorded override.
    const activating = body.onboarding_status === "activated" && existing[0].onboarding_status !== "activated";
    if (activating) {
      const stillOpen = await openItems(id);
      if (stillOpen.length > 0) {
        return NextResponse.json(
          {
            error: `This client can't be activated yet. Still open: ${stillOpen.join("; ")}. Complete them on the Checklist tab; the Managing Partner can override an item with a written reason.`,
            open_items: stillOpen,
          },
          { status: 409 },
        );
      }
    }

    const allowedFields = [
      "name", "trade_name", "entity_type_id", "pan", "gstin", "address",
      "contact_person", "contact_email", "contact_phone", "group_id",
      "partner_in_charge_id", "onboarding_status", "is_active", "notes",
      "financial_year_end_month",
    ];

    // The month the client's financial year ends in (1 to 12); blank means March.
    if ("financial_year_end_month" in body) {
      const raw = body.financial_year_end_month;
      const n = Number(raw);
      const blank = raw === null || raw === undefined || raw === "";
      if (!blank && !(Number.isInteger(n) && n >= 1 && n <= 12)) {
        return NextResponse.json({ error: "Choose the month the financial year ends in." }, { status: 422 });
      }
      body.financial_year_end_month = blank ? null : n;
    }

    // NFR: PAN stored encrypted; the conflict check finds duplicates by fingerprint.
    const securePan = "pan" in body ? await prepareClientPan(body.pan) : null;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (field in body) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(field === "pan" && securePan ? securePan.column : body[field] ?? null);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
    }

    // FR-02: remember what the plain fields held, to record what changed (PAN is never written out).
    const trackedFields = allowedFields.filter((f) => f in body && f !== "pan");
    const beforeRow = trackedFields.length
      ? ((await query<Record<string, unknown>>(`SELECT ${trackedFields.join(", ")} FROM clients WHERE id = $1`, [id]))[0] ?? {})
      : {};

    setClauses.push(`updated_at = now()`);
    values.push(id);

    const updated = await query<{ id: string; client_code: string; onboarding_status: string }>(
      `UPDATE clients SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, client_code, onboarding_status`,
      values,
    );
    if (securePan) await saveClientSecretMeta(id, securePan.meta);

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const f of trackedFields) {
      const was = beforeRow[f] ?? null;
      const now = body[f] ?? null;
      if (String(was ?? "") !== String(now ?? "")) changes[f] = { before: was, after: now };
    }
    if ("pan" in body) changes.pan = { before: "(protected)", after: "(changed)" };
    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        action: "update",
        entity_type: "clients",
        entity_id: id,
        field_changes: changes,
        user_id: session.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }
    if (activating) {
      await createAuditLog({
        action: "activate",
        entity_type: "clients",
        entity_id: id,
        field_changes: { onboarding_status: { before: existing[0].onboarding_status, after: "activated" } },
        user_id: session.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json({ client: updated[0] });
  } catch (err: unknown) {
    const protectedError = secureFieldErrorResponse(err);
    if (protectedError) return protectedError;
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canDelete = await userHasPermission(session.id, "delete_clients");
    if (!canDelete) {
      return NextResponse.json(
        { error: "You do not have permission to delete clients" },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (await clientOutOfScope(session.id, id)) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const rows = await query<{ id: string }>(
      `UPDATE clients SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Client deactivated" });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
