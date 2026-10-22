/**
 * GET /api/employees/:id/performance-notes — partner counselling notes for an
 * employee (FR-60 "Counsel staff", feeding FR-62 performance history).
 * Read from the audit trail, which records who was counselled at the time.
 * Requires view_employees.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission(req, "view_employees");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const { id } = await params;
    const employees = await query<{ user_id: string | null }>(
      `SELECT COALESCE(e.user_id, u.id) AS user_id
         FROM employees e
         LEFT JOIN users u ON u.employee_id = e.id
        WHERE e.id = $1
        LIMIT 1`,
      [id],
    );
    if (employees.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }
    const userId = employees[0].user_id;
    if (!userId) return NextResponse.json({ notes: [] });

    const notes = await query<{
      id: string;
      noted_at: string;
      note: string | null;
      partner_name: string | null;
      task_title: string | null;
      reason_label: string | null;
    }>(
      `SELECT al.id,
              al.created_at AS noted_at,
              al.field_changes -> 'disposition_notes' ->> 'after' AS note,
              p.name AS partner_name,
              ti.title AS task_title,
              rd.label AS reason_label
         FROM audit_logs al
         LEFT JOIN users p ON p.id = al.user_id
         LEFT JOIN delay_reason_dispositions d ON d.id = al.entity_id
         LEFT JOIN task_instances ti ON ti.id = d.task_instance_id
         LEFT JOIN reference_data rd ON rd.id = d.reason_id
        WHERE al.action = 'disposition_counsel'
          AND al.field_changes -> 'employee_user_id' ->> 'after' = $1
        ORDER BY al.created_at DESC
        LIMIT 100`,
      [userId],
    );
    return NextResponse.json({ notes });
  } catch (err: unknown) {
    console.error("GET /api/employees/:id/performance-notes error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
