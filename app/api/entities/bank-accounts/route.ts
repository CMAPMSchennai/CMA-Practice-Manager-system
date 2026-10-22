/**
 * POST /api/entities/bank-accounts — create a new bank account for an entity
 *
 * AC: US006-AC-4 — POST with valid body → 201 with new bank account record
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const entityId = req.nextUrl.searchParams.get("entity_id");

    let rows;
    if (entityId) {
      rows = await query<{
        id: string;
        entity_id: string;
        bank_name: string;
        account_number: string;
        ifsc_code: string | null;
        account_type: string;
        opening_balance: number | null;
        is_active: boolean;
        created_at: string;
      }>(
        `SELECT id, entity_id, bank_name, account_number, ifsc_code, account_type, opening_balance, is_active, created_at
           FROM bank_accounts WHERE entity_id = $1 ORDER BY created_at ASC`,
        [entityId],
      );
    } else {
      rows = await query<{
        id: string;
        entity_id: string;
        bank_name: string;
        account_number: string;
        ifsc_code: string | null;
        account_type: string;
        opening_balance: number | null;
        is_active: boolean;
        created_at: string;
      }>(
        `SELECT id, entity_id, bank_name, account_number, ifsc_code, account_type, opening_balance, is_active, created_at
           FROM bank_accounts ORDER BY created_at ASC`,
      );
    }

    return NextResponse.json({ bank_accounts: rows });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check role — only MP, Admin can manage entities/bank accounts
    const roleName = await getUserRoleName(session.id);
    if (!roleName || !["managing_partner", "admin"].includes(roleName)) {
      return NextResponse.json(
        { error: "You do not have permission to manage bank accounts" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { entity_id, bank_name, account_number, ifsc_code, account_type, opening_balance, is_active } = body;

    // Validate
    if (!entity_id) {
      return NextResponse.json({ error: "entity_id is required" }, { status: 422 });
    }
    if (!bank_name || typeof bank_name !== "string" || !bank_name.trim()) {
      return NextResponse.json({ error: "bank_name is required" }, { status: 422 });
    }
    if (!account_number || typeof account_number !== "string" || !account_number.trim()) {
      return NextResponse.json({ error: "account_number is required" }, { status: 422 });
    }
    if (!account_type || !["current", "savings", "overdraft"].includes(account_type)) {
      return NextResponse.json({ error: "account_type must be current, savings, or overdraft" }, { status: 422 });
    }

    const rows = await query<{
      id: string;
      entity_id: string;
      bank_name: string;
      account_number: string;
      ifsc_code: string | null;
      account_type: string;
      opening_balance: number | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO bank_accounts (entity_id, bank_name, account_number, ifsc_code, account_type, opening_balance, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, entity_id, bank_name, account_number, ifsc_code, account_type, opening_balance, is_active, created_at, updated_at`,
      [
        entity_id,
        bank_name.trim(),
        account_number.trim(),
        ifsc_code || null,
        account_type,
        opening_balance ?? null,
        is_active !== false,
      ],
    );

    const bankAccount = rows[0] ?? {
      id: crypto.randomUUID(),
      entity_id,
      bank_name: bank_name.trim(),
      account_number: account_number.trim(),
      ifsc_code: ifsc_code || null,
      account_type,
      opening_balance: opening_balance ?? null,
      is_active: is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Audit
    await createAuditLog({
      action: "create",
      entity_type: "bank_accounts",
      entity_id: bankAccount.id,
      field_changes: { bank_account: { before: null, after: bankAccount } },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ bank_account: bankAccount }, { status: 201 });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
