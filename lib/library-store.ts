/**
 * Reading and saving task libraries with versions (FR-09, FR-10).
 *
 * Saving a set of changes makes the next version of the library. A short note
 * and the list of changes are kept with it, so any engagement's recorded
 * version can be traced to what the library said then. Tasks already created
 * on engagements keep their own copy of each step, so they never change.
 * When a base template is saved, its brand variants get a new version too,
 * because they inherit the base's steps (FR-10).
 *
 * The history is kept as hidden reference_data rows (type 'library_version')
 * until schema changes are possible again (Dual7 migration 0042).
 */
import { query, pool } from "@/lib/db";
import { applyLibraryOps, type LibArea, type LibOp } from "@/lib/library-ops";

export interface LibrarySummary {
  id: string;
  name: string;
  description: string | null;
  version: number;
  is_variant: boolean;
  base_id: string | null;
  base_name: string | null;
  scope_type: string | null;
  scope_value: string | null;
  own_steps: number;
  total_steps: number;
  used_by: number;
  variants: number;
}

export interface VersionNote {
  version: number;
  note: string;
  by_name: string | null;
  at: string;
  changes: string[];
  inherited_from?: string | null;
}

export async function listLibraries(): Promise<LibrarySummary[]> {
  const rows = await query<{
    id: string;
    name: string;
    description: string | null;
    version: number;
    parent_template_id: string | null;
    base_name: string | null;
    own_steps: string;
    used_by: string;
    variants: string;
    scope: { type?: string; value?: string } | null;
  }>(
    `SELECT l.id, l.name, l.description, l.version, l.parent_template_id,
            p.name AS base_name,
            (SELECT COUNT(*) FROM task_library_steps s
               JOIN task_library_subtasks st ON st.id = s.task_library_subtask_id
               JOIN task_library_areas a ON a.id = st.task_library_area_id
              WHERE a.task_library_id = l.id)::text AS own_steps,
            (SELECT COUNT(*) FROM engagements e WHERE e.task_library_id = l.id)::text AS used_by,
            (SELECT COUNT(*) FROM task_libraries v WHERE v.parent_template_id = l.id)::text AS variants,
            (SELECT m.metadata -> 'scope' FROM reference_data m
              WHERE m.type = 'task_library_meta' AND m.metadata ->> 'library_id' = l.id::text LIMIT 1) AS scope
       FROM task_libraries l
       LEFT JOIN task_libraries p ON p.id = l.parent_template_id
      WHERE l.is_active = true
      ORDER BY l.name`,
  );
  const own = new Map(rows.map((r) => [r.id, parseInt(r.own_steps, 10)]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    version: r.version,
    is_variant: !!r.parent_template_id,
    base_id: r.parent_template_id,
    base_name: r.base_name,
    scope_type: r.scope?.type ?? null,
    scope_value: r.scope?.value ?? null,
    own_steps: parseInt(r.own_steps, 10),
    total_steps: parseInt(r.own_steps, 10) + (r.parent_template_id ? own.get(r.parent_template_id) ?? 0 : 0),
    used_by: parseInt(r.used_by, 10),
    variants: parseInt(r.variants, 10),
  }));
}

export async function loadTree(libraryId: string): Promise<LibArea[]> {
  const areas = await query<{ id: string; name: string; sort_order: number }>(
    `SELECT id, name, sort_order FROM task_library_areas WHERE task_library_id = $1 ORDER BY sort_order, created_at`,
    [libraryId],
  );
  if (areas.length === 0) return [];
  const subs = await query<{ id: string; area_id: string; name: string; sort_order: number }>(
    `SELECT id, task_library_area_id AS area_id, name, sort_order
       FROM task_library_subtasks WHERE task_library_area_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`,
    [areas.map((a) => a.id)],
  );
  const steps = subs.length
    ? await query<{
        id: string;
        subtask_id: string;
        step_code: string;
        name: string;
        description: string | null;
        sort_order: number;
        estimated_hours: string | null;
        default_assignee_role: string | null;
      }>(
        `SELECT id, task_library_subtask_id AS subtask_id, step_code, name, description, sort_order,
                estimated_hours::text AS estimated_hours, default_assignee_role
           FROM task_library_steps WHERE task_library_subtask_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`,
        [subs.map((s) => s.id)],
      )
    : [];
  return areas.map((a) => ({
    id: a.id,
    name: a.name,
    sort_order: a.sort_order,
    subtasks: subs
      .filter((s) => s.area_id === a.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        sort_order: s.sort_order,
        steps: steps
          .filter((x) => x.subtask_id === s.id)
          .map((x) => ({
            id: x.id,
            step_code: x.step_code,
            name: x.name,
            description: x.description,
            sort_order: x.sort_order,
            estimated_hours: x.estimated_hours === null ? null : Number(x.estimated_hours),
            default_assignee_role: x.default_assignee_role,
          })),
      })),
  }));
}

export async function getHistory(libraryId: string): Promise<VersionNote[]> {
  const rows = await query<{ metadata: VersionNote }>(
    `SELECT metadata FROM reference_data
      WHERE type = 'library_version' AND metadata ->> 'library_id' = $1
      ORDER BY (metadata ->> 'version')::int DESC`,
    [libraryId],
  );
  return rows.map((r) => r.metadata);
}

export async function getUsage(libraryId: string): Promise<{ version: number | null; engagements: number }[]> {
  const rows = await query<{ v: number | null; n: string }>(
    `SELECT task_library_version_used AS v, COUNT(*)::text AS n
       FROM engagements WHERE task_library_id = $1 GROUP BY 1 ORDER BY 1 DESC`,
    [libraryId],
  );
  return rows.map((r) => ({ version: r.v, engagements: parseInt(r.n, 10) }));
}

export class LibraryEditError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function saveLibraryVersion(args: {
  libraryId: string;
  baseVersion: number;
  ops: LibOp[];
  note: string;
  userId: string;
  userName: string;
}): Promise<{ version: number; changes: string[]; variants_bumped: number }> {
  const before = await loadTree(args.libraryId);
  const { tree: after, changes } = applyLibraryOps(before, args.ops);
  if (changes.length === 0) throw new LibraryEditError("There are no changes to save.", 422);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lib = await client.query<{ version: number }>(
      `SELECT version FROM task_libraries WHERE id = $1 FOR UPDATE`,
      [args.libraryId],
    );
    if (lib.rows.length === 0) throw new LibraryEditError("Library not found.", 404);
    if (lib.rows[0].version !== args.baseVersion) {
      throw new LibraryEditError(
        `This library is now at version ${lib.rows[0].version}, so your changes were made on an older copy. Reload and make them again.`,
        409,
      );
    }

    const beforeStepIds = new Set(before.flatMap((a) => a.subtasks.flatMap((s) => s.steps.map((x) => x.id))));
    const afterStepIds = new Set<string>();

    for (const area of after) {
      let areaId = area.id;
      if (area.is_new) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO task_library_areas (task_library_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
          [args.libraryId, area.name, area.sort_order],
        );
        areaId = r.rows[0].id;
      } else {
        await client.query(
          `UPDATE task_library_areas SET name = $2, sort_order = $3, updated_at = now() WHERE id = $1`,
          [area.id, area.name, area.sort_order],
        );
      }
      for (const st of area.subtasks) {
        let stId = st.id;
        if (st.is_new) {
          const r = await client.query<{ id: string }>(
            `INSERT INTO task_library_subtasks (task_library_area_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
            [areaId, st.name, st.sort_order],
          );
          stId = r.rows[0].id;
        } else {
          await client.query(
            `UPDATE task_library_subtasks SET name = $2, sort_order = $3, updated_at = now() WHERE id = $1`,
            [st.id, st.name, st.sort_order],
          );
        }
        for (const step of st.steps) {
          if (step.is_new) {
            await client.query(
              `INSERT INTO task_library_steps
                 (task_library_subtask_id, step_code, name, description, sort_order, override_flag,
                  default_assignee_role, estimated_hours)
               VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
              [stId, step.step_code, step.name, step.description, step.sort_order, step.default_assignee_role, step.estimated_hours],
            );
          } else {
            afterStepIds.add(step.id);
            await client.query(
              `UPDATE task_library_steps
                  SET name = $2, description = $3, sort_order = $4, default_assignee_role = $5,
                      estimated_hours = $6, updated_at = now()
                WHERE id = $1`,
              [step.id, step.name, step.description, step.sort_order, step.default_assignee_role, step.estimated_hours],
            );
          }
        }
      }
    }
    const removed = Array.from(beforeStepIds).filter((id) => !afterStepIds.has(id));
    if (removed.length > 0) {
      await client.query(`DELETE FROM task_library_steps WHERE id = ANY($1::uuid[])`, [removed]);
    }

    const newVersion = args.baseVersion + 1;
    await client.query(`UPDATE task_libraries SET version = $2, updated_at = now() WHERE id = $1`, [args.libraryId, newVersion]);

    const at = new Date().toISOString();
    const record = (libId: string, version: number, extra: Record<string, unknown>) =>
      client.query(
        `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
         VALUES ('library_version', $1, $2, 0, true, $3::jsonb)`,
        [
          `${libId}:${version}`,
          `Version ${version}`,
          JSON.stringify({ library_id: libId, version, at, by: args.userId, by_name: args.userName, ...extra }),
        ],
      );
    await record(args.libraryId, newVersion, { note: args.note, changes });

    // Brand variants inherit this library's steps, so they move to a new version as well.
    const variants = await client.query<{ id: string; version: number }>(
      `SELECT id, version FROM task_libraries WHERE parent_template_id = $1 FOR UPDATE`,
      [args.libraryId],
    );
    for (const v of variants.rows) {
      await client.query(`UPDATE task_libraries SET version = version + 1, updated_at = now() WHERE id = $1`, [v.id]);
      await record(v.id, v.version + 1, {
        note: `The base template moved to version ${newVersion}: ${args.note}`,
        changes: changes.map((c) => `Base template: ${c}`),
        inherited_from: args.libraryId,
      });
    }

    await client.query("COMMIT");
    return { version: newVersion, changes, variants_bumped: variants.rows.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
