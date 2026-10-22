/**
 * GET /api/reports/run?report=&from=&to=&entity_id=&partner_id=&group_id=&by=  (FR-79, FR-80)
 * Runs one report and returns its table for the screen.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { chosenReport, rbacFailure, reportContext } from "@/lib/report-access";

export async function GET(req: NextRequest) {
  try {
    const ctx = await reportContext(req);
    const chosen = chosenReport(req, ctx);
    if ("response" in chosen) return chosen.response;
    const result = await chosen.def.run(chosen.filters, ctx);
    return NextResponse.json({
      report: { id: chosen.def.id, name: chosen.def.name, description: chosen.def.description },
      filters: chosen.filters,
      ...result,
    });
  } catch (err: unknown) {
    const denied = rbacFailure(err);
    if (denied) return denied;
    console.error("GET /api/reports/run error:", err);
    return NextResponse.json({ error: "The report could not be run." }, { status: 500 });
  }
}
