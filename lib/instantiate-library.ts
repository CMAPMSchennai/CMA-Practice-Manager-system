/**
 * Copy a task library onto an engagement as task instances (FR-48), keeping
 * Area → Sub-Task → Step order and step ids. A brand variant inherits every
 * step of its base template, and its own steps override or add to them (FR-10).
 * Used by the Instantiate Library action and by recurring engagements (FR-06).
 */
import { query, pool } from "@/lib/db";
import { getTaskLibraryMeta } from "@/lib/task-library-seed";

export class InstantiateError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "InstantiateError";
  }
}

interface StepRow {
  step_id: string;
  step_code: string;
  step_name: string;
  step_description: string | null;
  step_sort_order: number;
  override_flag: boolean;
  default_assignee_role: string | null;
  estimated_hours: number | null;
  subtask_name: string;
  area_name: string;
}

const loadSteps = (libraryId: string) =>
  query<StepRow>(
    `SELECT
       s.id AS step_id,
       s.step_code,
       s.name AS step_name,
       s.description AS step_description,
       s.sort_order AS step_sort_order,
       s.override_flag,
       s.default_assignee_role,
       s.estimated_hours,
       st.name AS subtask_name,
       a.name AS area_name
     FROM task_library_steps s
     JOIN task_library_subtasks st ON st.id = s.task_library_subtask_id
     JOIN task_library_areas a ON a.id = st.task_library_area_id
     WHERE a.task_library_id = $1
     ORDER BY a.sort_order, st.sort_order, s.sort_order`,
    [libraryId],
  );

export async function instantiateLibraryOnEngagement(
  engagementId: string,
  taskLibraryId: string,
): Promise<{ tasks_created: number; library_version: number }> {
  const engRows = await query<{ id: string }>(`SELECT id FROM engagements WHERE id = $1`, [engagementId]);
  if (engRows.length === 0) throw new InstantiateError("Engagement not found", 404);

  const existing = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM task_instances WHERE engagement_id = $1`,
    [engagementId],
  );
  if (parseInt(existing[0].cnt, 10) > 0) {
    throw new InstantiateError("Task library already instantiated for this engagement", 409);
  }

  const libRows = await query<{ id: string; version: number; parent_template_id: string | null }>(
    `SELECT id, version, parent_template_id FROM task_libraries WHERE id = $1`,
    [taskLibraryId],
  );
  if (libRows.length === 0) throw new InstantiateError("Task library not found", 404);

  const libraryVersion = libRows[0].version;
  const parentTemplateId = libRows[0].parent_template_id;

  let steps = await loadSteps(taskLibraryId);

  // FR-10: brand variant = base template steps, overridden or extended by its own.
  if (parentTemplateId) {
    const meta = await getTaskLibraryMeta(taskLibraryId);
    const prefix = meta?.step_prefix ? `${meta.step_prefix}-` : "";
    const own = new Map(steps.map((s) => [s.step_code, s]));
    const base = await loadSteps(parentTemplateId);
    const merged = base.map((b) => {
      const override = own.get(b.step_code);
      if (override) own.delete(b.step_code);
      return override ?? b;
    });
    steps = [...merged, ...Array.from(own.values())].map((s) => ({
      ...s,
      step_code: prefix && !s.step_code.startsWith(prefix) ? `${prefix}${s.step_code}` : s.step_code,
    }));
  }

  if (steps.length === 0) throw new InstantiateError("Task library has no steps to instantiate", 422);

  // Gap #83: tasks get their due date when a doer is assigned (see lib/app-settings.ts), not here.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let sortOrder = 0;
    for (const step of steps) {
      sortOrder++;
      await client.query(
        `INSERT INTO task_instances
           (engagement_id, library_step_ref, library_area_name, library_subtask_name,
            step_code, title, description, status, priority, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', 'medium', $8)`,
        [
          engagementId,
          step.step_id,
          step.area_name,
          step.subtask_name,
          step.step_code,
          step.step_name,
          step.step_description,
          sortOrder,
        ],
      );
    }
    await client.query(
      `UPDATE engagements
          SET task_library_id = $1, task_library_version_used = $2, updated_at = now()
        WHERE id = $3`,
      [taskLibraryId, libraryVersion, engagementId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { tasks_created: steps.length, library_version: libraryVersion };
}
