import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { computeAndStoreReadiness } from "@/lib/payroll-readiness";

/**
 * POST /api/payroll-readiness/compute
 *
 * Compute payroll readiness (FR-14) for all active employees of an entity for a month.
 * Body: { period: "YYYY-MM", payroll_entity_id: uuid }
 * Rules live in lib/payroll-readiness.ts. Released records are not changed (FR-61).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_payroll");

    const body = await req.json();
    const { period, payroll_entity_id } = body as {
      period?: string;
      payroll_entity_id?: string;
    };

    if (!period || !payroll_entity_id) {
      return NextResponse.json(
        { error: "period and payroll_entity_id are required" },
        { status: 422 }
      );
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json(
        { error: "period must be in YYYY-MM format" },
        { status: 422 }
      );
    }

    const entityRows = await query<{ id: string }>(
      `SELECT id FROM entities WHERE id = $1`,
      [payroll_entity_id]
    );
    if (entityRows.length === 0) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const results = await computeAndStoreReadiness(period, payroll_entity_id);

    await createAuditLog({
      action: "compute",
      entity_type: "payroll_readiness",
      entity_id: payroll_entity_id,
      field_changes: {
        period: { before: null, after: period },
        computed_count: { before: null, after: results.length },
      },
      user_id: user.id,
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ computed: results.length });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
