import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { requireUser } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/audit";
import { getAccessScope, taskVisibleSql } from "@/lib/access-scope";

/**
 * GET /api/delay-reason-dispositions
 * List delay reason disposition records.
 *
 * Query params:
 *  - undispositioned=true → only records with no disposition yet
 *  - task_instance_id → filter by specific task
 *
 * AC US017-3: GET ?undispositioned=true → 200 with array of open blocking items
 */
export async function GET(req: NextRequest) {
  try {
    const viewer = await requirePermission(req, "view_tasks");

    const undispositioned = req.nextUrl.searchParams.get("undispositioned");
    const status = req.nextUrl.searchParams.get("status"); // open | actioned | all
    const taskInstanceId = req.nextUrl.searchParams.get("task_instance_id");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (undispositioned === "true" || status === "open") {
      conditions.push(`d.disposition_action IS NULL`);
    } else if (status === "actioned") {
      conditions.push(`d.disposition_action IS NOT NULL`);
    }

    if (taskInstanceId) {
      conditions.push(`d.task_instance_id = $${idx++}`);
      params.push(taskInstanceId);
    }

    // FR-03: only delay reasons on tasks within the user's scope.
    const scope = await getAccessScope(viewer.id, viewer.roleName);
    if (scope.mode !== "all") {
      conditions.push(taskVisibleSql(scope, idx++));
      params.push(viewer.id);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<{
      id: string;
      task_instance_id: string;
      reason_id: string;
      reason_label: string | null;
      free_text: string | null;
      logged_by: string;
      logged_at: string;
      disposition_action: string | null;
      disposition_notes: string | null;
      dispositioned_by: string | null;
      dispositioned_at: string | null;
      task_title: string | null;
      engagement_id: string | null;
      created_at: string;
      reason_code: string | null;
      client_name: string | null;
      assignee_id: string | null;
      assignee_name: string | null;
      logged_by_name: string | null;
      dispositioned_by_name: string | null;
      due_date: string | null;
      days_late: number | null;
    }>(
      `SELECT
         d.id,
         d.task_instance_id,
         d.reason_id,
         rd.label AS reason_label,
         rd.code AS reason_code,
         d.free_text,
         d.logged_by,
         d.logged_at,
         d.disposition_action,
         d.disposition_notes,
         d.dispositioned_by,
         d.dispositioned_at,
         ti.title AS task_title,
         ti.engagement_id,
         d.created_at,
         c.name AS client_name,
         -- A DR-06 handover item concerns the original assignee (who logged it),
         -- every other item concerns the task's current assignee.
         CASE WHEN rd.code = 'DR-06' THEN d.logged_by ELSE ti.assigned_to END AS assignee_id,
         CASE WHEN rd.code = 'DR-06' THEN lb.name ELSE asg.name END AS assignee_name,
         lb.name AS logged_by_name,
         db.name AS dispositioned_by_name,
         ti.due_date,
         CASE WHEN ti.due_date IS NULL THEN NULL
              ELSE GREATEST(0, CURRENT_DATE - ti.due_date::date) END AS days_late
       FROM delay_reason_dispositions d
       LEFT JOIN reference_data rd ON rd.id = d.reason_id
       LEFT JOIN task_instances ti ON ti.id = d.task_instance_id
       LEFT JOIN engagements e ON e.id = ti.engagement_id
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN users asg ON asg.id = ti.assigned_to
       LEFT JOIN users lb ON lb.id = d.logged_by
       LEFT JOIN users db ON db.id = d.dispositioned_by
       ${where}
       ORDER BY COALESCE(d.dispositioned_at, d.logged_at) DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ dispositions: rows });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/delay-reason-dispositions
 * Create a new delay reason disposition record.
 *
 * Body: { task_instance_id, reason_id, free_text?, payroll_impact? }
 *
 * AC US017-2: 201 with the new disposition record
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);

    // Anyone authenticated with edit_tasks can log a delay reason
    await requirePermission(req, "edit_tasks");

    const body = await req.json();
    const { task_instance_id, reason_id, free_text, payroll_impact } = body as {
      task_instance_id?: string;
      reason_id?: string;
      free_text?: string;
      payroll_impact?: boolean;
    };

    if (!task_instance_id) {
      return NextResponse.json(
        { error: "task_instance_id is required" },
        { status: 422 }
      );
    }
    if (!reason_id) {
      return NextResponse.json(
        { error: "reason_id is required" },
        { status: 422 }
      );
    }

    // Verify the task instance exists
    const taskRows = await query<{ id: string }>(
      `SELECT id FROM task_instances WHERE id = $1`,
      [task_instance_id]
    );
    if (taskRows.length === 0) {
      return NextResponse.json(
        { error: "Task instance not found" },
        { status: 404 }
      );
    }

    // Verify the reason_id references a valid reference_data row of type 'delay_reason'
    const reasonRows = await query<{ id: string }>(
      `SELECT id FROM reference_data WHERE id = $1 AND type = 'delay_reason'`,
      [reason_id]
    );
    if (reasonRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid delay reason — must be a reference_data entry of type 'delay_reason'" },
        { status: 422 }
      );
    }

    const rows = await query<{
      id: string;
      task_instance_id: string;
      reason_id: string;
      free_text: string | null;
      logged_by: string;
      logged_at: string;
      disposition_action: string | null;
      disposition_notes: string | null;
      dispositioned_by: string | null;
      dispositioned_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO delay_reason_dispositions
         (task_instance_id, reason_id, free_text, logged_by, logged_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING *`,
      [task_instance_id, reason_id, free_text || null, user.id]
    );

    const created = rows[0];

    await createAuditLog({
      action: "create",
      entity_type: "delay_reason_disposition",
      entity_id: created.id,
      field_changes: {
        task_instance_id: { before: null, after: task_instance_id },
        reason_id: { before: null, after: reason_id },
      },
      user_id: user.id,
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ disposition: created }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
