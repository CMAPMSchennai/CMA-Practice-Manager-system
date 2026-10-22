import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getAccessScope, taskVisibleSql } from "@/lib/access-scope";
import { allowedTargets } from "@/lib/task-workflow";

/**
 * GET /api/task-instances — list task instances, filterable by engagement_id, status, assigned_to.
 * Each task also carries the names of its doer and reviewer, and what the
 * signed-in user may do with it (`actions` = statuses they may move it to,
 * `can_assign`), worked out by the same rules the update API enforces.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_tasks");

    const url = req.nextUrl;
    const engagementId = url.searchParams.get("engagement_id");
    const status = url.searchParams.get("status");
    const assignedTo = url.searchParams.get("assigned_to");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 1000);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (engagementId) {
      conditions.push(`ti.engagement_id = $${idx++}`);
      params.push(engagementId);
    }
    const clientId = url.searchParams.get("client_id");
    if (clientId) {
      conditions.push(`ti.engagement_id IN (SELECT id FROM engagements WHERE client_id = $${idx++})`);
      params.push(clientId);
    }
    if (status) {
      conditions.push(`ti.status = $${idx++}`);
      params.push(status);
    }
    if (assignedTo) {
      conditions.push(`ti.assigned_to = $${idx++}`);
      params.push(assignedTo);
    }

    // FR-03 / §4: only tasks within the user's scope (articled clerks: own tasks).
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all") {
      conditions.push(taskVisibleSql(scope, idx++));
      params.push(user.id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT ti.id, ti.engagement_id, ti.library_step_ref,
              ti.library_area_name, ti.library_subtask_name,
              ti.step_code, ti.title, ti.description,
              ti.assigned_to, ti.reviewer, ti.status, ti.priority,
              ti.due_date, ti.planned_start_date, ti.completed_at, ti.sort_order, ti.observations,
              ti.created_at, ti.updated_at,
              (SELECT en.engagement_code FROM engagements en WHERE en.id = ti.engagement_id) AS engagement_code,
              COALESCE(NULLIF(trim(au.name), ''), au.email) AS assigned_to_name,
              COALESCE(NULLIF(trim(ru.name), ''), ru.email) AS reviewer_name
       FROM task_instances ti
       LEFT JOIN users au ON au.id = ti.assigned_to
       LEFT JOIN users ru ON ru.id = ti.reviewer
       ${where}
       ORDER BY ti.sort_order ASC, ti.created_at ASC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    // §4: Manager, Partner, Admin and MP create and assign tasks; doers do not.
    const canCreate = await userHasPermission(user.id, "create_tasks");
    const tasks = rows.map((r) => {
      const t = {
        status: String(r.status),
        assigned_to: (r.assigned_to as string | null) ?? null,
        reviewer: (r.reviewer as string | null) ?? null,
      };
      const closed = t.status === "completed" || t.status === "not_applicable";
      return {
        ...r,
        actions: allowedTargets(t, user.id, user.roleName),
        can_assign: canCreate && !closed,
        is_assignee: t.assigned_to === user.id,
        is_reviewer: t.reviewer === user.id,
      };
    });

    return NextResponse.json({ task_instances: tasks }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
