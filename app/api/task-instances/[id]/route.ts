import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, getUserRoleName, getUserRole, userHasPermission } from "@/lib/rbac";
import { ASSIGNEE_TRANSITIONS, REVIEWER_TRANSITIONS } from "@/lib/task-workflow";
import { checkAssigneeEligibility } from "@/lib/task-assignment";
import { requireUser } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/audit";
import { currentPeriod, recomputeForUsers } from "@/lib/payroll-readiness";
import { canSeeTask, getAccessScope } from "@/lib/access-scope";
import { defaultTaskDueDate } from "@/lib/app-settings";

/**
 * Maker–checker status transitions (FR-51, AC-10).
 *
 * Assignee (or a partner / manager / admin acting for them):
 *   not_started → in_progress
 *   in_progress → under_review   (needs a reviewer who is not the assignee)
 *   in_progress → blocked
 *   returned    → in_progress
 *   blocked     → in_progress
 *
 * The task's named reviewer only — never the assignee, and nobody else:
 *   under_review → completed | returned | not_applicable
 *   not_started / in_progress → not_applicable
 * A task therefore reaches Completed (or N/A) only through reviewer sign-off;
 * articled clerks' work always goes through review.
 */
// The transition tables live in lib/task-workflow.ts, shared with the screen.

/**
 * GET /api/task-instances/:id — fetch a single task instance
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(req, "view_tasks");
    const { id } = await params;
    if (!(await canSeeTask(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM task_instances WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    return NextResponse.json({ task_instance: rows[0] });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/task-instances/:id — update task instance (status, observations, working papers)
 *
 * Maker-checker enforcement:
 *  - Only the assignee (or someone with edit_tasks) can move through assignee transitions
 *  - Only the reviewer (or someone with review_tasks) can sign off / return
 *  - Nobody else can change status → 403
 *
 * Delay-reason enforcement:
 *  - If the task is overdue (due_date < today) and a status change is attempted,
 *    delay_reason_id must be provided in the body → 422 DELAY_REASON_REQUIRED
 *
 * AC US016-1: PATCH with { status: 'in_progress', working_paper_ref: 'WP-001' } → 200
 * AC US016-2: PATCH with { status: 'completed' } by assignee → 403
 * AC US016-3: PATCH with any status by someone with no role in the task → 403
 * AC US017-1: PATCH overdue task with status change but no delay_reason_id → 422
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req);
    const { id } = await params;

    const body = await req.json();
    const {
      status: newStatus,
      observations,
      working_paper_ref,
      actual_hours,
      priority,
      delay_reason_id,
    } = body as {
      status?: string;
      observations?: string;
      working_paper_ref?: string;
      actual_hours?: number;
      priority?: string;
      delay_reason_id?: string;
    };
    // FR-50 / §4: giving a task a doer or reviewer (null clears it).
    const newAssignee: string | null | undefined =
      "assigned_to" in body ? (body.assigned_to ? String(body.assigned_to) : null) : undefined;
    const newReviewer: string | null | undefined =
      "reviewer" in body ? (body.reviewer ? String(body.reviewer) : null) : undefined;

    // DM-07: due date (null clears it). Set by those who assign work.
    const newDueDate: string | null | undefined =
      "due_date" in body ? (body.due_date ? String(body.due_date).slice(0, 10) : null) : undefined;
    if (newDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
      return NextResponse.json({ error: "INVALID_DATE", message: "Enter the due date as a valid date." }, { status: 422 });
    }

    // Planned start date (null clears it). Set by those who assign work.
    const newPlannedStart: string | null | undefined =
      "planned_start_date" in body ? (body.planned_start_date ? String(body.planned_start_date).slice(0, 10) : null) : undefined;
    if (newPlannedStart && !/^\d{4}-\d{2}-\d{2}$/.test(newPlannedStart)) {
      return NextResponse.json({ error: "INVALID_DATE", message: "Enter the planned start date as a valid date." }, { status: 422 });
    }

    // Fetch current task
    const taskRows = await query<{
      id: string;
      engagement_id: string;
      assigned_to: string | null;
      reviewer: string | null;
      status: string;
      due_date: string | null;
      planned_start_date: string | null;
      observations: string | null;
      working_paper_refs: unknown;
      actual_hours: number | null;
      priority: string | null;
      version: number;
    }>(
      `SELECT id, engagement_id, assigned_to, reviewer, status, due_date, planned_start_date,
              observations, working_paper_refs, actual_hours, priority, version
       FROM task_instances WHERE id = $1`,
      [id]
    );

    if (taskRows.length === 0) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    const task = taskRows[0];

    // FR-03: tasks outside the user's scope are reported as not found.
    if (!(await canSeeTask(await getAccessScope(user.id), id))) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    // Build update fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Assignment: Manager, Partner, Admin and MP only (create_tasks), never the doers.
    if (newAssignee !== undefined || newReviewer !== undefined) {
      if (!(await userHasPermission(user.id, "create_tasks"))) {
        return NextResponse.json(
          { error: "You do not have permission to assign tasks" },
          { status: 403 }
        );
      }
      if (task.status === "completed" || task.status === "not_applicable") {
        return NextResponse.json(
          { error: "TASK_CLOSED", message: "This task is closed and can't be reassigned." },
          { status: 409 }
        );
      }
      const finalAssignee = newAssignee !== undefined ? newAssignee : task.assigned_to;
      const finalReviewer = newReviewer !== undefined ? newReviewer : task.reviewer;

      if (newAssignee !== undefined && newAssignee !== task.assigned_to) {
        // FR-56: once work has started, moving it to someone else goes through the
        // partner's Reassign action so the handover is recorded.
        if (task.assigned_to && task.status !== "not_started") {
          return NextResponse.json(
            {
              error: "USE_REASSIGN",
              message: "This task has been started. Use the partner's Reassign action so the handover is recorded.",
            },
            { status: 409 }
          );
        }
        if (newAssignee) {
          const eligibility = await checkAssigneeEligibility(newAssignee);
          if (!eligibility.ok) {
            return NextResponse.json({ error: eligibility.code, message: eligibility.message }, { status: 422 });
          }
        }
        updates.push(`assigned_to = $${idx++}`);
        values.push(newAssignee);
        // Gap #83: a task with no date gets one, counted from today, when its doer is assigned.
        if (newAssignee && !task.due_date && newDueDate === undefined) {
          const autoDue = await defaultTaskDueDate();
          if (autoDue) {
            updates.push(`due_date = $${idx++}`);
            values.push(autoDue);
          }
        }
      }
      if (newReviewer !== undefined && newReviewer !== task.reviewer) {
        if (newReviewer) {
          const role = await getUserRole(newReviewer);
          if (!role || role.permissions.review_tasks !== true) {
            return NextResponse.json(
              { error: "REVIEWER_NOT_ALLOWED", message: "This person's role can't review tasks." },
              { status: 422 }
            );
          }
        }
        updates.push(`reviewer = $${idx++}`);
        values.push(newReviewer);
      }
      // FR-51: the reviewer can never be the doer.
      if (finalReviewer && finalAssignee && finalReviewer === finalAssignee) {
        return NextResponse.json(
          { error: "REVIEWER_IS_ASSIGNEE", message: "The reviewer must be a different person from the doer." },
          { status: 422 }
        );
      }
    }

    if (newDueDate !== undefined && newDueDate !== (task.due_date ? String(task.due_date).slice(0, 10) : null)) {
      if (!(await userHasPermission(user.id, "create_tasks"))) {
        return NextResponse.json({ error: "You do not have permission to set due dates" }, { status: 403 });
      }
      if (task.status === "completed" || task.status === "not_applicable") {
        return NextResponse.json(
          { error: "TASK_CLOSED", message: "This task is closed and its due date can't be changed." },
          { status: 409 }
        );
      }
      updates.push(`due_date = $${idx++}`);
      values.push(newDueDate);
    }

    const currentPlanned = task.planned_start_date ? String(task.planned_start_date).slice(0, 10) : null;
    if (newPlannedStart !== undefined && newPlannedStart !== currentPlanned) {
      if (!(await userHasPermission(user.id, "create_tasks"))) {
        return NextResponse.json({ error: "You do not have permission to set planned start dates" }, { status: 403 });
      }
      if (task.status === "completed" || task.status === "not_applicable") {
        return NextResponse.json(
          { error: "TASK_CLOSED", message: "This task is closed and its planned start date can't be changed." },
          { status: 409 }
        );
      }
      updates.push(`planned_start_date = $${idx++}`);
      values.push(newPlannedStart);
    }

    // Handle status transition
    if (newStatus && newStatus !== task.status) {
      const isAssignee = task.assigned_to === user.id;
      const isReviewer = task.reviewer !== null && task.reviewer === user.id;
      const roleName = await getUserRoleName(user.id);
      const actsForAssignee =
        roleName === "managing_partner" ||
        roleName === "partner" ||
        roleName === "admin" ||
        roleName === "manager";

      let allowed = false;

      const reviewerTargets = REVIEWER_TRANSITIONS[task.status] || [];
      if (reviewerTargets.includes(newStatus)) {
        // FR-51: only the named reviewer signs off, and never on their own work.
        if (isReviewer && !isAssignee) {
          allowed = true;
        } else if (isAssignee) {
          return NextResponse.json(
            { error: "SELF_APPROVAL", message: "You cannot sign off a task assigned to you." },
            { status: 403 }
          );
        }
      }

      if (!allowed) {
        const assigneeTargets = ASSIGNEE_TRANSITIONS[task.status] || [];
        if (assigneeTargets.includes(newStatus) && (isAssignee || actsForAssignee)) {
          allowed = true;
        }
      }

      // FR-51: work can't start on a task that has no doer.
      if (allowed && newStatus === "in_progress" && !task.assigned_to) {
        return NextResponse.json(
          { error: "DOER_REQUIRED", message: "Assign a doer before starting this task." },
          { status: 422 }
        );
      }

      // Work can't be started on an engagement that is on hold, finished or cancelled.
      if (allowed && newStatus === "in_progress") {
        const eng = await query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [task.engagement_id]);
        const es = eng[0]?.status;
        if (es === "on_hold" || es === "completed" || es === "cancelled") {
          return NextResponse.json(
            {
              error: "ENGAGEMENT_NOT_OPEN",
              message: `This engagement is ${es === "on_hold" ? "on hold" : es}, so work can't be started on its tasks.`,
            },
            { status: 409 },
          );
        }
      }

      // Submitting for review needs a reviewer who is not the assignee.
      if (allowed && newStatus === "under_review") {
        if (!task.reviewer || task.reviewer === task.assigned_to) {
          return NextResponse.json(
            {
              error: "REVIEWER_REQUIRED",
              message: "Assign a reviewer (other than the assignee) before submitting for review.",
            },
            { status: 422 }
          );
        }
      }

      if (!allowed) {
        return NextResponse.json(
          { error: "You are not authorized to perform this status transition" },
          { status: 403 }
        );
      }

      // Delay reason enforcement: if task is overdue, require delay_reason_id
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate < today && !delay_reason_id) {
          return NextResponse.json(
            {
              error: "DELAY_REASON_REQUIRED",
              message:
                "This task is overdue. A delay reason must be provided when changing status.",
            },
            { status: 422 }
          );
        }
      }

      updates.push(`status = $${idx++}`);
      values.push(newStatus);

      // If completed, set completed_at
      if (newStatus === "completed") {
        updates.push(`completed_at = now()`);
      }
    }

    // Handle observations
    if (observations !== undefined) {
      updates.push(`observations = $${idx++}`);
      values.push(observations);
    }

    // Handle working_paper_ref — append to the JSONB array
    if (working_paper_ref !== undefined) {
      // Append the ref to the existing array
      updates.push(
        `working_paper_refs = COALESCE(working_paper_refs, '[]'::jsonb) || to_jsonb($${idx++}::text)`
      );
      values.push(working_paper_ref);
    }

    // Handle actual_hours
    if (actual_hours !== undefined) {
      updates.push(`actual_hours = $${idx++}`);
      values.push(actual_hours);
    }

    // Handle priority
    if (priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      values.push(priority);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 422 }
      );
    }

    updates.push(`updated_at = now()`);
    updates.push(`version = version + 1`);

    values.push(id);
    const sql = `UPDATE task_instances SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`;
    const updated = await query<Record<string, unknown>>(sql, values);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    // If a delay reason was provided alongside a status change on an overdue task,
    // auto-create the delay disposition record
    if (newStatus && newStatus !== task.status && delay_reason_id) {
      await query(
        `INSERT INTO delay_reason_dispositions
           (task_instance_id, reason_id, free_text, logged_by, logged_at)
         VALUES ($1, $2, $3, $4, now())`,
        [id, delay_reason_id, body.free_text || null, user.id]
      );
    }

    await createAuditLog({
      action: "update",
      entity_type: "task_instance",
      entity_id: id,
      field_changes: {
        ...(newStatus ? { status: { before: task.status, after: newStatus } } : {}),
        ...(observations !== undefined
          ? { observations: { before: task.observations, after: observations } }
          : {}),
        ...(working_paper_ref !== undefined
          ? { working_paper_ref: { before: null, after: working_paper_ref } }
          : {}),
        ...(newAssignee !== undefined && newAssignee !== task.assigned_to
          ? { assigned_to: { before: task.assigned_to, after: newAssignee } }
          : {}),
        ...(newDueDate !== undefined && newDueDate !== (task.due_date ? String(task.due_date).slice(0, 10) : null)
          ? { due_date: { before: task.due_date, after: newDueDate } }
          : {}),
        ...(newPlannedStart !== undefined && newPlannedStart !== currentPlanned
          ? { planned_start_date: { before: currentPlanned, after: newPlannedStart } }
          : {}),
        ...(newReviewer !== undefined && newReviewer !== task.reviewer
          ? { reviewer: { before: task.reviewer, after: newReviewer } }
          : {}),
      },
      user_id: user.id,
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    // The first task started on a Draft engagement makes it Active (Gap #65).
    if (newStatus === "in_progress" && task.status !== "in_progress") {
      const woke = await query<{ id: string }>(
        `UPDATE engagements SET status = 'active', updated_at = now()
          WHERE id = $1 AND status = 'draft' RETURNING id`,
        [task.engagement_id],
      );
      if (woke.length > 0) {
        await createAuditLog({
          action: "status_change",
          entity_type: "engagement",
          entity_id: task.engagement_id,
          field_changes: { status: { before: "draft", after: "active (first task started)" } },
          user_id: user.id,
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
          user_agent: req.headers.get("user-agent"),
        });
      }
    }

    // FR-60: the assignee's salary status follows task completion and assignment.
    const assigneeChanged = newAssignee !== undefined && newAssignee !== task.assigned_to;
    if ((newStatus && newStatus !== task.status && task.assigned_to) || assigneeChanged) {
      try {
        await recomputeForUsers(
          [...new Set([task.assigned_to, newAssignee ?? null].filter((u): u is string => !!u))],
          [currentPeriod(), ...(task.due_date ? [String(task.due_date).slice(0, 7)] : [])],
        );
      } catch (recomputeErr) {
        console.error("[task-instances] payroll recompute failed:", recomputeErr);
      }
    }

    return NextResponse.json({ task_instance: updated[0] });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
