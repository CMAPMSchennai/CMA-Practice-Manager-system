import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

/**
 * GET /api/statutory-calendar-rules — list all statutory calendar rules
 *
 * AC (US030-AC-2): articled_clerk → 403 (requires manage_compliance permission)
 *
 * Only managing_partner, partner, and admin have manage_compliance.
 * articled_clerk and paid_assistant do NOT, so they get 403.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_compliance");

    const url = req.nextUrl;
    const isActive = url.searchParams.get("is_active");
    const frequency = url.searchParams.get("frequency");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (isActive !== null) {
      conditions.push(`scr.is_active = $${idx++}`);
      params.push(isActive === "true");
    }
    if (frequency) {
      conditions.push(`scr.frequency = $${idx++}`);
      params.push(frequency);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT scr.id, scr.name, scr.statute, scr.form_or_return,
              scr.applicable_entity_types, scr.applicable_service_type_id,
              scr.frequency, scr.due_day_of_month, scr.due_date_logic,
              scr.escalation_rules, scr.is_active,
              scr.created_at, scr.updated_at,
              st.name AS service_type_name
       FROM statutory_calendar_rules scr
       LEFT JOIN service_types st ON st.id = scr.applicable_service_type_id
       ${where}
       ORDER BY scr.name ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return NextResponse.json({ statutory_calendar_rules: rows }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
