/**
 * Shared set-up for the report routes: who is asking and what they may see.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { getReport, parseFilters, type Filters, type ReportContext, type ReportDef } from "@/lib/reports";

export async function reportContext(req: NextRequest): Promise<ReportContext> {
  const user = await requirePermission(req, "view_reports");
  const [billing, finance, payroll, employees, scope] = await Promise.all([
    userHasPermission(user.id, "view_billing"),
    userHasPermission(user.id, "view_finance"),
    userHasPermission(user.id, "view_payroll"),
    userHasPermission(user.id, "view_employees"),
    getAccessScope(user.id, user.roleName),
  ]);
  return { userId: user.id, scope, billing, finance, payroll, employees };
}

export function rbacFailure(err: unknown): NextResponse | null {
  if (err && typeof err === "object" && "status" in err) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
  return null;
}

/** The chosen report and filters from the query string, or a ready-made error response. */
export function chosenReport(
  req: NextRequest,
  ctx: ReportContext,
): { def: ReportDef; filters: Filters } | { response: NextResponse } {
  const sp = req.nextUrl.searchParams;
  const def = getReport(sp.get("report") ?? "");
  if (!def) return { response: NextResponse.json({ error: "Unknown report." }, { status: 404 }) };
  if (!def.allowed(ctx)) {
    return { response: NextResponse.json({ error: "You do not have access to this report." }, { status: 403 }) };
  }
  const parsed = parseFilters(sp);
  if (!parsed.filters) return { response: NextResponse.json({ error: parsed.error }, { status: 422 }) };
  return { def, filters: parsed.filters };
}
