/**
 * POST /api/onboarding-tokens — generate a token-based onboarding link for a client
 *
 * US011-AC-1: managing_partner creates token → 201 with { token, expires_at }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { randomBytes } from "crypto";
import { canSeeClient, clientVisibleSql, getAccessScope } from "@/lib/access-scope";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canOnboard = await userHasPermission(session.id, "onboard_clients");
    if (!canOnboard) {
      return NextResponse.json(
        { error: "You do not have permission to generate onboarding tokens" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { client_id } = body;

    if (!client_id) {
      return NextResponse.json({ error: "client_id is required" }, { status: 422 });
    }
    if (!(await canSeeClient(await getAccessScope(session.id), client_id))) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Validate client exists
    const clientRows = await query<{ id: string }>(
      `SELECT id FROM clients WHERE id = $1 LIMIT 1`,
      [client_id],
    );
    if (clientRows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Generate a secure random token
    const token = randomBytes(32).toString("hex");

    // Token expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Invalidate any prior unused tokens for this client + generator pair
    await query(
      `DELETE FROM onboarding_tokens
        WHERE client_id = $1 AND generated_by = $2 AND used_at IS NULL`,
      [client_id, session.id],
    );

    // One row per client and person: a new link replaces their earlier one, used or not
    // (the database allows only one per pair). The submitted answers stay on the client record.
    const rows = await query<{ id: string; token: string; expires_at: string }>(
      `INSERT INTO onboarding_tokens (token, client_id, expires_at, generated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, generated_by) DO UPDATE
         SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, used_at = NULL, updated_at = now()
       RETURNING id, token, expires_at`,
      [token, client_id, expiresAt.toISOString(), session.id],
    );

    return NextResponse.json(
      {
        token: rows[0].token,
        expires_at: rows[0].expires_at,
        id: rows[0].id,
      },
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

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canOnboard = await userHasPermission(session.id, "onboard_clients");
    if (!canOnboard) {
      return NextResponse.json(
        { error: "You do not have permission to view onboarding tokens" },
        { status: 403 },
      );
    }

    const sp = req.nextUrl.searchParams;
    const clientId = sp.get("client_id");

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (clientId) {
      conditions.push(`client_id = $${idx++}`);
      values.push(clientId);
    }

    // FR-03: only tokens for clients within the user's scope.
    const scope = await getAccessScope(session.id);
    if (scope.mode !== "all") {
      conditions.push(clientVisibleSql(scope, "client_id", idx++));
      values.push(session.id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query(
      `SELECT id, token, client_id, expires_at, used_at, generated_by, created_at
         FROM onboarding_tokens
         ${where}
         ORDER BY created_at DESC`,
      values,
    );

    return NextResponse.json({ tokens: rows });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
