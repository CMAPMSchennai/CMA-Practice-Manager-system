import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, getUserRole } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { checkAssigneeEligibility } from "@/lib/task-assignment";
import { defaultTaskDueDate } from "@/lib/app-settings";

/**
 * POST /api/task-instances/bulk-assign
 * Bulk-assign tasks within an engagement, filtered by area_name.
 *
 * Body: { engagement_id, area_name, assigned_to, reviewer? }
 * AC US015-3: 200 with { updated_count: N }
 */
export async function POST(req: NextRequest) {
  try {
    // §4: Manager, Partner, Admin and MP create and assign tasks; doers execute them.
    const user = await requirePermission(req, "create_tasks");

    const body = await req.json();
    const { engagement_id, area_name, area_names, assigned_to, reviewer } = body as {
      engagement_id?: string;
      area_name?: string;
      area_names?: string[];
      assigned_to?: string;
      reviewer?: string;
    };
    // One area (area_name) or several at once (area_names).
    const areaList = Array.from(
      new Set(
        [...(Array.isArray(area_names) ? area_names : []), ...(area_name ? [area_name] : [])].filter(
          (a): a is string => typeof a === "string" && a.trim() !== "",
        ),
      ),
    );

    if (!engagement_id) {
      return NextResponse.json(
        { error: "engagement_id is required" },
        { status: 422 }
      );
    }
    if (areaList.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one area" },
        { status: 422 }
      );
    }
    if (!assigned_to) {
      return NextResponse.json(
        { error: "assigned_to is required" },
        { status: 422 }
      );
    }

    // FR-42: only onboarded employees can be assigned tasks.
    const eligibility = await checkAssigneeEligibility(assigned_to);
    if (!eligibility.ok) {
      return NextResponse.json(
        { error: eligibility.code, message: eligibility.message },
        { status: 422 }
      );
    }

    // FR-51: the reviewer can never be the assignee.
    if (reviewer && reviewer === assigned_to) {
      return NextResponse.json(
        {
          error: "REVIEWER_IS_ASSIGNEE",
          message: "The reviewer must be a different person from the assignee.",
        },
        { status: 422 }
      );
    }

    if (reviewer) {
      const role = await getUserRole(reviewer);
      if (!role || role.permissions.review_tasks !== true) {
        return NextResponse.json(
          { error: "REVIEWER_NOT_ALLOWED", message: "This person's role can't review tasks." },
          { status: 422 }
        );
      }
    }

    // Build update
    const setClauses: string[] = [
      `assigned_to = $1`,
      `updated_at = now()`,
    ];
    const params: unknown[] = [assigned_to];
    let idx = 2;

    if (reviewer) {
      setClauses.push(`reviewer = $${idx++}`);
      params.push(reviewer);
    } else {
      // A previous reviewer who is now the assignee can't review their own work.
      setClauses.push(`reviewer = CASE WHEN reviewer = $1 THEN NULL ELSE reviewer END`);
    }

    // Gap #83: a task with no date gets one, counted from today, when its doer is assigned.
    setClauses.push(`due_date = COALESCE(due_date, $${idx++}::date)`);
    params.push(await defaultTaskDueDate());

    params.push(engagement_id); // $idx
    const engIdx = idx++;
    params.push(areaList); // $idx
    const areaIdx = idx++;

    const result = await query<{ id: string }>(
      `UPDATE task_instances
       SET ${setClauses.join(", ")}
       WHERE engagement_id = $${engIdx}
         AND library_area_name = ANY($${areaIdx}::text[])
         AND status = 'not_started'
       RETURNING id`,
      params
    );

    const updatedCount = result.length;
    // FR-50 / FR-56: steps already started or closed keep their doer.
    const skipped = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM task_instances
        WHERE engagement_id = $1 AND library_area_name = ANY($2::text[]) AND status <> 'not_started'`,
      [engagement_id, areaList]
    );

    if (updatedCount > 0) {
      await createAuditLog({
        action: "bulk_assign",
        entity_type: "task_instance",
        entity_id: engagement_id,
        field_changes: {
          area_name: { before: null, after: areaList.length === 1 ? areaList[0] : `${areaList.length} areas` },
          assigned_to: { before: null, after: assigned_to },
          updated_count: { before: null, after: updatedCount },
        },
        user_id: user.id,
        ip_address:
          req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json({ updated_count: updatedCount, skipped_count: skipped[0]?.n ?? 0 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
