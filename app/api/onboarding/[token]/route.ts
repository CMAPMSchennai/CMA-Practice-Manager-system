/**
 * GET  /api/onboarding/:token — validate token (public, no auth)
 *
 * US011-AC-2: expired/invalid token → 400 with error message
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const rows = await query<{
      id: string;
      token: string;
      client_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, token, client_id, expires_at, used_at
         FROM onboarding_tokens
        WHERE token = $1
        LIMIT 1`,
      [token],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or unknown onboarding token" },
        { status: 400 },
      );
    }

    const record = rows[0];

    if (record.used_at) {
      return NextResponse.json(
        { error: "This onboarding link has already been used" },
        { status: 400 },
      );
    }

    if (new Date(record.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This onboarding link has expired" },
        { status: 400 },
      );
    }

    // Fetch client details for the form
    const clientRows = await query<Record<string, unknown>>(
      `SELECT id, name, trade_name, entity_type_id, incorporation_date::text AS incorporation_date,
              registration_no, address, city, state, pin,
              contact_person, designation, contact_email, contact_phone, preferred_communication,
              gstin, financial_year_end_month, billing_email
         FROM clients WHERE id = $1 LIMIT 1`,
      [record.client_id],
    );

    // The choices the form offers (FR-31). PAN is never sent back to the browser.
    const [entityTypes, services] = await Promise.all([
      query<{ id: string; label: string }>(
        `SELECT id, label FROM reference_data WHERE type = 'entity_type' AND is_active = true ORDER BY sort_order, label`,
      ),
      query<{ id: string; name: string }>(
        `SELECT id, name FROM service_types WHERE is_active = true AND parent_service_id IS NULL ORDER BY name`,
      ),
    ]);

    return NextResponse.json({
      valid: true,
      client: clientRows[0] ?? null,
      entity_types: entityTypes,
      services,
      expires_at: record.expires_at,
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
