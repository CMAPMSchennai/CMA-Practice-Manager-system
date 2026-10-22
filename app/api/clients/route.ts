/**
 * POST /api/clients — create a new client
 * GET  /api/clients — list clients with filters
 *
 * US010 acceptance criteria
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { clientVisibleSql, getAccessScope } from "@/lib/access-scope";
import { prepareClientPan, saveClientSecretMeta, secureFieldErrorResponse } from "@/lib/secure-fields";

/** The month (1 to 12) a client's financial year ends in; anything else means "not set" (March is assumed). */
function fyMonthOf(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** Generate next sequential client_code like CLI-0001, CLI-0002 */
async function generateClientCode(): Promise<string> {
  const rows = await query<{ client_code: string }>(
    `SELECT client_code FROM clients
      WHERE client_code LIKE 'CLI-%'
      ORDER BY client_code DESC
      LIMIT 1`,
    [],
  );

  if (rows.length === 0) {
    return "CLI-0001";
  }

  const last = rows[0].client_code;
  const numPart = last.replace("CLI-", "");
  const num = parseInt(numPart, 10);
  if (isNaN(num)) return "CLI-0001";
  return `CLI-${String(num + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canCreate = await userHasPermission(session.id, "create_clients");
    if (!canCreate) {
      return NextResponse.json(
        { error: "You do not have permission to create clients" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      name,
      trade_name,
      entity_type_id,
      pan,
      gstin,
      address,
      contact_person,
      contact_email,
      contact_phone,
      group_id,
      partner_in_charge_id,
      notes,
      financial_year_end_month,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 422 });
    }

    // NFR: PAN stored encrypted; the conflict check finds duplicates by fingerprint.
    const securePan = await prepareClientPan(pan);

    const client_code = await generateClientCode();

    const insertRows = await query<{
      id: string;
      client_code: string;
      onboarding_status: string;
    }>(
      `INSERT INTO clients (
        client_code, name, trade_name, entity_type_id, pan, gstin,
        address, contact_person, contact_email, contact_phone,
        group_id, partner_in_charge_id, onboarding_status, notes,
        financial_year_end_month
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, 'imported', $13,
        $14
      )
      RETURNING id, client_code, onboarding_status`,
      [
        client_code,
        name.trim(),
        trade_name ?? null,
        entity_type_id ?? null,
        securePan.column,
        gstin ?? null,
        address ?? null,
        contact_person ?? null,
        contact_email ?? null,
        contact_phone ?? null,
        group_id ?? null,
        partner_in_charge_id ?? null,
        notes ?? null,
        fyMonthOf(financial_year_end_month),
      ],
    );

    await saveClientSecretMeta(insertRows[0].id, securePan.meta);

    return NextResponse.json({ client: insertRows[0] }, { status: 201 });
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

export async function GET(req: NextRequest) {
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

    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const groupId = sp.get("group_id");
    const partnerId = sp.get("partner_in_charge_id");
    const search = sp.get("search");
    const isActive = sp.get("is_active");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    // The engagement, invoice and compliance pickers ask for `limit`; with 261+ clients they
    // must see all of them, not just the newest 20.
    const pageSize = Math.min(
      500,
      Math.max(1, parseInt(sp.get("page_size") ?? sp.get("limit") ?? "20", 10)),
    );
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`onboarding_status = $${idx++}`);
      values.push(status);
    }

    if (groupId) {
      conditions.push(`group_id = $${idx++}`);
      values.push(groupId);
    }

    if (partnerId) {
      conditions.push(`partner_in_charge_id = $${idx++}`);
      values.push(partnerId);
    }

    if (search) {
      conditions.push(
        `(name ILIKE $${idx} OR trade_name ILIKE $${idx} OR client_code ILIKE $${idx})`,
      );
      values.push(`%${search}%`);
      idx++;
    }

    if (isActive !== null && isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(isActive === "true");
    }

    // FR-03: only clients within the user's scope.
    const scope = await getAccessScope(session.id);
    if (scope.mode !== "all") {
      conditions.push(clientVisibleSql(scope, "id", idx++));
      values.push(session.id);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRows = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM clients ${where}`,
      values,
    );
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const rows = await query(
      `SELECT id, client_code, name, trade_name, entity_type_id, gstin,
              contact_person, contact_email, contact_phone, group_id,
              partner_in_charge_id, onboarding_status, is_active,
              created_at, updated_at,
              (SELECT COALESCE(NULLIF(trim(u.name), ''), u.email)
                 FROM users u WHERE u.id = clients.partner_in_charge_id) AS partner_name,
              (SELECT rd.label FROM reference_data rd
                WHERE rd.id = clients.entity_type_id) AS entity_type_label
         FROM clients
         ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset],
    );

    return NextResponse.json({
      clients: rows,
      pagination: {
        total,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize),
      },
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
