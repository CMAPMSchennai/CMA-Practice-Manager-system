import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { computeAndStoreReadiness } from "@/lib/payroll-readiness";

/**
 * POST /api/payroll-readiness/:id/release — Managing Partner releases one salary (FR-15, FR-61).
 *
 * Body (optional): { notes?: string }
 * Readiness is recomputed first; release is allowed only when the status is Ready,
 * i.e. every open blocking item has been dispositioned (AC-7). There is no override.
 * The released record is dated and locked — later recomputes leave it untouched.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(req, "payroll_release");
    const { id } = await params;

    let notes: string | null = null;
    try {
      const body = await req.json();
      notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    } catch {
      // No body is fine
    }

    const rows = await query<{
      id: string;
      employee_id: string;
      payroll_entity_id: string;
      period: string;
      salary_status: string;
      released_by: string | null;
      released_at: string | null;
    }>(
      `SELECT id, employee_id, payroll_entity_id, to_char(period, 'YYYY-MM') AS period,
              salary_status, released_by, released_at
         FROM payroll_readiness
        WHERE id = $1`,
      [id]
    );
    const record = rows[0];
    if (!record) {
      return NextResponse.json(
        { error: "Payroll readiness record not found" },
        { status: 404 }
      );
    }
    if (record.salary_status === "released") {
      return NextResponse.json({
        released_by: record.released_by,
        released_at: record.released_at,
      });
    }

    // Re-check against current task and disposition data before releasing.
    const [fresh] = await computeAndStoreReadiness(
      record.period,
      record.payroll_entity_id,
      [record.employee_id]
    );
    if (!fresh || fresh.salary_status !== "ready") {
      return NextResponse.json(
        {
          error: "NOT_READY",
          message: fresh
            ? `Salary can only be released when the status is Ready. ${fresh.blocking_items} blocking item(s) and ${fresh.pending_acceptance} item(s) awaiting partner acceptance remain.`
            : "This employee is no longer active on this entity's payroll.",
          salary_status: fresh?.salary_status ?? null,
          open_blocking_items: fresh?.blocking_items ?? null,
          pending_acceptance: fresh?.pending_acceptance ?? null,
        },
        { status: 422 }
      );
    }

    const updated = await query<{ released_by: string; released_at: string }>(
      `UPDATE payroll_readiness
          SET salary_status = 'released',
              released_by = $2,
              released_at = now(),
              notes = COALESCE($3, notes),
              updated_at = now()
        WHERE id = $1 AND salary_status = 'ready'
        RETURNING released_by, released_at`,
      [id, user.id, notes]
    );
    if (updated.length === 0) {
      return NextResponse.json(
        { error: "NOT_READY", message: "The status changed while releasing. Refresh and try again." },
        { status: 409 }
      );
    }

    await createAuditLog({
      action: "release",
      entity_type: "payroll_readiness",
      entity_id: id,
      field_changes: {
        salary_status: { before: "ready", after: "released" },
        released_by: { before: null, after: user.id },
        period: { before: null, after: record.period },
        tasks: {
          before: null,
          after: {
            assigned: fresh.tasks_assigned,
            done: fresh.tasks_done,
            overdue: fresh.tasks_overdue,
            completion_pct: fresh.completion_pct,
          },
        },
      },
      user_id: user.id,
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      released_by: updated[0].released_by,
      released_at: updated[0].released_at,
    });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
