import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { evaluateReadiness } from "@/lib/payroll-readiness";

/** FR-04: salary figures are visible only to the Managing Partner, Partners and Admin. */
const SALARY_VISIBLE_ROLES = new Set(["managing_partner", "partner", "admin"]);

/**
 * GET /api/payroll-readiness?period=YYYY-MM&payroll_entity_id=:id
 *
 * Stored readiness records for the month plus the live FR-57 scorecard
 * figures (assigned, done, overdue, on-time, pending acceptance). Released
 * records keep the figures stored at release time.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_payroll");

    const period = req.nextUrl.searchParams.get("period");
    const payrollEntityId = req.nextUrl.searchParams.get("payroll_entity_id");

    if (!period || !payrollEntityId) {
      return NextResponse.json(
        { error: "period and payroll_entity_id query params are required" },
        { status: 422 }
      );
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json(
        { error: "period must be in YYYY-MM format" },
        { status: 422 }
      );
    }

    const rows = await query<{
      id: string;
      employee_id: string;
      employee_name: string;
      employee_id_code: string;
      position_type: string;
      salary_status: string;
      task_completion_pct: number | null;
      open_blocking_items: number;
      released_by: string | null;
      released_by_name: string | null;
      released_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         pr.id,
         pr.employee_id,
         trim(concat_ws(' ', e.first_name, e.last_name)) AS employee_name,
         e.employee_id_code,
         e.position_type,
         pr.salary_status,
         pr.task_completion_pct,
         pr.open_blocking_items,
         pr.released_by,
         rb.name AS released_by_name,
         pr.released_at,
         pr.notes,
         pr.created_at,
         pr.updated_at
       FROM payroll_readiness pr
       JOIN employees e ON e.id = pr.employee_id
       LEFT JOIN users rb ON rb.id = pr.released_by
      WHERE pr.payroll_entity_id = $1
        AND pr.period = $2::date
      ORDER BY e.first_name, e.last_name`,
      [payrollEntityId, `${period}-01`]
    );

    const live = await evaluateReadiness(
      period,
      payrollEntityId,
      rows.map((r) => r.employee_id)
    );
    const liveByEmployee = new Map(live.map((l) => [l.employee_id, l]));
    const showSalary = SALARY_VISIBLE_ROLES.has(user.roleName);

    const readiness = rows.map((r) => {
      const l = liveByEmployee.get(r.employee_id);
      return {
        ...r,
        tasks_assigned: l?.tasks_assigned ?? null,
        tasks_done: l?.tasks_done ?? null,
        tasks_overdue: l?.tasks_overdue ?? null,
        on_time_pct:
          l && l.tasks_done > 0 ? Math.round((l.on_time_count / l.tasks_done) * 10000) / 10000 : null,
        pending_acceptance: l?.pending_acceptance ?? null,
        gross_amount: showSalary ? l?.gross_amount ?? null : null,
      };
    });

    return NextResponse.json({ readiness, salary_visible: showSalary });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
