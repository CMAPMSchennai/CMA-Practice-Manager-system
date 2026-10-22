import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getSessionUser } from "@/lib/auth-helpers";
import { clientVisibleSql, getAccessScope } from "@/lib/access-scope";
import { maybeRunEscalation } from "@/lib/escalation";

/**
 * GET /api/statutory-due-dates — list statutory due dates with filters
 *
 * Query params:
 *   client_id — filter by client
 *   month — filter by month (YYYY-MM format), returns due dates within that month
 *   status — filter by status
 *   owner_id — filter by owner
 *   limit / offset — pagination
 *
 * AC (US018-AC-2): GET ?client_id=:id → 200 with array containing status, escalation_level, due_date, owner_id
 * AC (US018-AC-3): GET without auth → 401
 * AC (US030-AC-1): GET ?month=2024-11 → 200 with array containing compliance_name, due_date, status, escalation_level
 */
export async function GET(req: NextRequest) {
  try {
    // Auth check — 401 if unauthenticated
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Permission check — need view_compliance
    const hasPermission = await userHasPermission(user.id, "view_compliance");
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Permission 'view_compliance' denied" },
        { status: 403 }
      );
    }

    // FR-67: keep overdue flags and the escalation ladder current (at most every 15 minutes).
    await maybeRunEscalation();

    const url = req.nextUrl;
    const clientId = url.searchParams.get("client_id");
    const month = url.searchParams.get("month"); // YYYY-MM
    const status = url.searchParams.get("status");
    const ownerId = url.searchParams.get("owner_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (clientId) {
      conditions.push(`sd.client_id = $${idx++}`);
      params.push(clientId);
    }
    if (month) {
      // Parse YYYY-MM and filter due_date within that month
      const [year, mon] = month.split("-").map(Number);
      if (year && mon && mon >= 1 && mon <= 12) {
        const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
        // Last day of month
        const lastDay = new Date(year, mon, 0).getDate();
        const endDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        conditions.push(`sd.due_date >= $${idx++}::date`);
        params.push(startDate);
        conditions.push(`sd.due_date <= $${idx++}::date`);
        params.push(endDate);
      }
    }
    if (status) {
      conditions.push(`sd.status = $${idx++}`);
      params.push(status);
    }
    if (ownerId) {
      conditions.push(`sd.owner_id = $${idx++}`);
      params.push(ownerId);
    }

    // FR-03: only due dates for clients within the user's scope.
    const scope = await getAccessScope(user.id);
    if (scope.mode !== "all") {
      conditions.push(clientVisibleSql(scope, "sd.client_id", idx++));
      params.push(user.id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT sd.id, sd.client_id, sd.rule_id, sd.obligation_name,
              sd.obligation_name AS compliance_name,
              sd.due_date, sd.period_label, sd.status,
              sd.escalation_level, sd.owner_id, sd.completed_at,
              sd.notes, sd.created_at, sd.updated_at,
              c.name AS client_name,
              scr.name AS rule_name,
              scr.statute, scr.form_or_return
       FROM statutory_due_dates sd
       LEFT JOIN clients c ON c.id = sd.client_id
       LEFT JOIN statutory_calendar_rules scr ON scr.id = sd.rule_id
       ${where}
       ORDER BY sd.due_date ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return NextResponse.json({ statutory_due_dates: rows }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
