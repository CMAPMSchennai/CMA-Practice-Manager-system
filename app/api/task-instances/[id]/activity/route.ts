/**
 * GET /api/task-instances/:id/activity — who did what on a task, and when (FR-02).
 * Read from the audit trail. Anyone who may see the task may see its history.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { canSeeTask, getAccessScope } from "@/lib/access-scope";

type Change = { before?: unknown; after?: unknown };

const STATUS_WORDS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  under_review: "Under review",
  returned: "Returned",
  blocked: "Blocked",
  completed: "Completed",
  not_applicable: "Not applicable",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "view_tasks");
    const { id } = await params;
    if (!(await canSeeTask(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json({ error: "Task instance not found" }, { status: 404 });
    }

    const rows = await query<{
      id: string;
      created_at: string;
      field_changes: Record<string, Change> | null;
      user_name: string | null;
    }>(
      `SELECT al.id, al.created_at, al.field_changes,
              COALESCE(NULLIF(trim(u.name), ''), u.email) AS user_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
        WHERE al.entity_type = 'task_instance' AND al.entity_id = $1
        ORDER BY al.created_at ASC
        LIMIT 100`,
      [id],
    );

    // Names for doer / reviewer ids mentioned in the changes.
    const ids = new Set<string>();
    for (const r of rows) {
      for (const key of ["assigned_to", "reviewer"]) {
        const c = r.field_changes?.[key];
        if (c && typeof c.after === "string") ids.add(c.after);
      }
    }
    const names = new Map<string, string>();
    if (ids.size > 0) {
      const people = await query<{ id: string; name: string }>(
        `SELECT id, COALESCE(NULLIF(trim(name), ''), email) AS name FROM users WHERE id = ANY($1::uuid[])`,
        [[...ids]],
      );
      for (const p of people) names.set(p.id, p.name);
    }

    const events: { id: string; at: string; by: string | null; text: string }[] = [];
    for (const r of rows) {
      const fc = r.field_changes ?? {};
      const status = fc.status;
      if (status) {
        const before = String(status.before ?? "");
        const after = String(status.after ?? "");
        const text =
          before === "not_started" && after === "in_progress"
            ? "Started"
            : `Status changed from ${STATUS_WORDS[before] ?? before} to ${STATUS_WORDS[after] ?? after}`;
        events.push({ id: `${r.id}-s`, at: r.created_at, by: r.user_name, text });
      }
      if (fc.assigned_to) {
        const a = fc.assigned_to.after;
        events.push({
          id: `${r.id}-a`,
          at: r.created_at,
          by: r.user_name,
          text: a ? `Doer set to ${names.get(String(a)) ?? "someone"}` : "Doer removed",
        });
      }
      if (fc.reviewer) {
        const a = fc.reviewer.after;
        events.push({
          id: `${r.id}-r`,
          at: r.created_at,
          by: r.user_name,
          text: a ? `Reviewer set to ${names.get(String(a)) ?? "someone"}` : "Reviewer removed",
        });
      }
      if (fc.due_date) {
        const a = fc.due_date.after;
        events.push({
          id: `${r.id}-d`,
          at: r.created_at,
          by: r.user_name,
          text: a ? `Due date set to ${String(a).slice(0, 10)}` : "Due date cleared",
        });
      }
    }

    return NextResponse.json({ events });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
