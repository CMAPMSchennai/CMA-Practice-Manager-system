/**
 * GET /api/reports/list  the reports this user may run, and the choices for the filters (FR-79, FR-80)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { rbacFailure, reportContext } from "@/lib/report-access";
import { REPORTS } from "@/lib/reports";

export async function GET(req: NextRequest) {
  try {
    const ctx = await reportContext(req);
    const [entities, partners, groups] = await Promise.all([
      query<{ id: string; name: string; short_code: string }>(`SELECT id, name, short_code FROM entities ORDER BY short_code`),
      query<{ id: string; name: string }>(
        `SELECT u.id, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.name IN ('managing_partner', 'partner') ORDER BY name`,
      ),
      query<{ id: string; name: string }>(`SELECT id, name FROM client_groups ORDER BY name`),
    ]);
    return NextResponse.json({
      reports: REPORTS.filter((r) => r.allowed(ctx)).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        uses: r.uses,
      })),
      entities,
      partners,
      groups,
    });
  } catch (err: unknown) {
    const denied = rbacFailure(err);
    if (denied) return denied;
    console.error("GET /api/reports/list error:", err);
    return NextResponse.json({ error: "The reports could not be loaded." }, { status: 500 });
  }
}
