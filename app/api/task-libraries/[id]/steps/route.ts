import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

/**
 * GET /api/task-libraries/:id/steps?flat=true
 * Returns a flat list of all steps in the library's 4-level hierarchy.
 * AC-3: 200 with array of steps including id, step_code, name, sort_order
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "view_tasks");

    const { id } = await params;

    // Verify the library exists
    const libRows = await query<{ id: string }>(
      `SELECT id FROM task_libraries WHERE id = $1`,
      [id]
    );
    if (libRows.length === 0) {
      return NextResponse.json(
        { error: "Task library not found" },
        { status: 404 }
      );
    }

    const flat = req.nextUrl.searchParams.get("flat");

    if (flat === "true") {
      // Return a flat list of all steps across the hierarchy
      const steps = await query<{
        id: string;
        step_code: string;
        name: string;
        description: string | null;
        sort_order: number;
        override_flag: boolean;
        default_assignee_role: string | null;
        estimated_hours: number | null;
        subtask_id: string;
        subtask_name: string;
        area_id: string;
        area_name: string;
      }>(
        `SELECT
           s.id,
           s.step_code,
           s.name,
           s.description,
           s.sort_order,
           s.override_flag,
           s.default_assignee_role,
           s.estimated_hours,
           st.id AS subtask_id,
           st.name AS subtask_name,
           a.id AS area_id,
           a.name AS area_name
         FROM task_library_steps s
         JOIN task_library_subtasks st ON st.id = s.task_library_subtask_id
         JOIN task_library_areas a ON a.id = st.task_library_area_id
         WHERE a.task_library_id = $1
         ORDER BY a.sort_order, st.sort_order, s.sort_order`,
        [id]
      );

      return NextResponse.json({ steps });
    }

    // Default: hierarchical response
    const areas = await query<{
      id: string;
      name: string;
      sort_order: number;
      description: string | null;
    }>(
      `SELECT id, name, sort_order, description
       FROM task_library_areas
       WHERE task_library_id = $1
       ORDER BY sort_order`,
      [id]
    );

    const areaIds = areas.map((a) => a.id);
    if (areaIds.length === 0) {
      return NextResponse.json({ areas: [] });
    }

    const subtasks = await query<{
      id: string;
      task_library_area_id: string;
      name: string;
      sort_order: number;
      description: string | null;
    }>(
      `SELECT id, task_library_area_id, name, sort_order, description
       FROM task_library_subtasks
       WHERE task_library_area_id = ANY($1)
       ORDER BY sort_order`,
      [areaIds]
    );

    const subtaskIds = subtasks.map((s) => s.id);

    const steps =
      subtaskIds.length > 0
        ? await query<{
            id: string;
            task_library_subtask_id: string;
            step_code: string;
            name: string;
            description: string | null;
            sort_order: number;
            override_flag: boolean;
            default_assignee_role: string | null;
            estimated_hours: number | null;
          }>(
            `SELECT id, task_library_subtask_id, step_code, name, description,
                    sort_order, override_flag, default_assignee_role, estimated_hours
             FROM task_library_steps
             WHERE task_library_subtask_id = ANY($1)
             ORDER BY sort_order`,
            [subtaskIds]
          )
        : [];

    // Build hierarchy
    const hierarchy = areas.map((area) => ({
      ...area,
      subtasks: subtasks
        .filter((st) => st.task_library_area_id === area.id)
        .map((st) => ({
          ...st,
          steps: steps.filter((s) => s.task_library_subtask_id === st.id),
        })),
    }));

    return NextResponse.json({ areas: hierarchy });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
