/**
 * Loads the firm's master task libraries (FR-06/07/08/10, Appendix C) once per
 * database, from the data generated from "CMA Workflow Automation.xlsx":
 *   - Statutory Audit PVT (87 steps) and LST (105) — entity-type templates
 *   - Internal Audit SID (64), GOP (75), IA-MAH (50) — client libraries
 *   - OEM Operational Audit base template (111) + Hyundai / Mahindra / Nissan
 *     variants that inherit every base step (FR-10); variants carry only overrides.
 * Four levels: Library → Area (Task) → Sub-Task → Step (FR-07). Step IDs are kept
 * exactly as in the workbook; OEM variants prefix the brand code at instantiation
 * (HYU-VEH-A01-01). "MAH" is namespaced as IA-MAH / OA-MAH at library level (§7.4).
 *
 * Each library's scope and step prefix are recorded in reference_data
 * (type 'task_library_meta', code = library key) for scope-based selection (FR-08).
 * Libraries that already exist by name are left untouched.
 */
import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { pool, isMockMode, query } from "@/lib/db";
import { STATUTORY_LIBRARIES } from "@/lib/data/task-libraries-statutory";
import { INTERNAL_AUDIT_LIBRARIES } from "@/lib/data/task-libraries-internal";
import { OEM_LIBRARIES } from "@/lib/data/task-libraries-oem";

export interface StepSeed {
  code: string;
  text: string;
  notes: string;
}
export interface SubtaskSeed {
  code: string;
  name: string;
  steps: StepSeed[];
}
export interface AreaSeed {
  code: string;
  name: string;
  subtasks: SubtaskSeed[];
}
export interface LibrarySeed {
  key: string;
  name: string;
  scope: { type: "entity_type" | "client" | "oem_brand"; value: string; legacy_code?: string };
  parent_key?: string;
  step_prefix?: string;
  areas: AreaSeed[];
}

export const TASK_LIBRARY_META_TYPE = "task_library_meta";
const SEED_VERSION = "1";

/**
 * SHA-256 of each data file's content as extracted from the workbook, plus the
 * expected step counts (Appendix C). The seed refuses to load if the bundled
 * content differs, so altered or partial procedures never reach the database.
 */
const EXPECTED = [
  { group: "statutory", libs: () => STATUTORY_LIBRARIES, sha256: "880d4b0e93d26a576924f497ce32099dba73206c9ed022ef4632434c3764f13f", steps: 192 },
  { group: "internal", libs: () => INTERNAL_AUDIT_LIBRARIES, sha256: "8590e74f48f75ca6e5b5040eec15a12a179f4ccbc438d46c68a020bc9a969afe", steps: 189 },
  { group: "oem", libs: () => OEM_LIBRARIES, sha256: "4cb438e5763bdc276d93d4287e988e3f9d086b0aa03e75db8a81dc63c9ff709b", steps: 111 },
];

function countSteps(libs: LibrarySeed[]): number {
  return libs.reduce(
    (n, l) => n + l.areas.reduce((m, a) => m + a.subtasks.reduce((k, s) => k + s.steps.length, 0), 0),
    0,
  );
}

function verifySeedData(): void {
  for (const e of EXPECTED) {
    const libs = e.libs();
    const digest = createHash("sha256").update(JSON.stringify(libs), "utf8").digest("hex");
    const steps = countSteps(libs);
    if (digest !== e.sha256 || steps !== e.steps) {
      throw new Error(
        `Task library data "${e.group}" does not match the workbook (sha256 ${digest}, ${steps} steps; expected ${e.steps}). Not loading.`,
      );
    }
  }
}

export interface TaskLibraryMeta {
  library_id: string;
  key: string;
  scope: LibrarySeed["scope"];
  parent_key: string | null;
  step_prefix: string | null;
}

/** Scope / prefix metadata for a library, if it came from the workbook seed. */
export async function getTaskLibraryMeta(libraryId: string): Promise<TaskLibraryMeta | null> {
  const rows = await query<{ metadata: TaskLibraryMeta | null }>(
    `SELECT metadata FROM reference_data
      WHERE type = $1 AND metadata ->> 'library_id' = $2
      LIMIT 1`,
    [TASK_LIBRARY_META_TYPE, libraryId],
  );
  return rows[0]?.metadata ?? null;
}

async function insertLibrary(
  client: PoolClient,
  lib: LibrarySeed,
  parentId: string | null,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM task_libraries WHERE name = $1 LIMIT 1`,
    [lib.name],
  );
  let libraryId: string;
  if (existing.rows.length > 0) {
    libraryId = existing.rows[0].id;
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO task_libraries (name, description, version, parent_template_id, is_active)
       VALUES ($1, $2, 1, $3, true)
       RETURNING id`,
      [
        lib.name,
        lib.parent_key
          ? `Brand variant of the OEM base template — inherits every base step (FR-10).`
          : `Imported from CMA Workflow Automation.xlsx.`,
        parentId,
      ],
    );
    libraryId = inserted.rows[0].id;

    for (const [ai, area] of lib.areas.entries()) {
      const a = await client.query<{ id: string }>(
        `INSERT INTO task_library_areas (task_library_id, name, sort_order, description)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [libraryId, area.name.slice(0, 500), ai + 1, area.code],
      );
      for (const [si, sub] of area.subtasks.entries()) {
        const s = await client.query<{ id: string }>(
          `INSERT INTO task_library_subtasks (task_library_area_id, name, sort_order, description)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [a.rows[0].id, sub.name.slice(0, 500), si + 1, sub.code],
        );
        for (const [ti, step] of sub.steps.entries()) {
          await client.query(
            `INSERT INTO task_library_steps
               (task_library_subtask_id, step_code, name, description, sort_order, override_flag)
             VALUES ($1, $2, $3, $4, $5, false)`,
            [
              s.rows[0].id,
              step.code.slice(0, 50),
              step.text.slice(0, 500),
              step.notes || null,
              ti + 1,
            ],
          );
        }
      }
    }
  }

  const meta: TaskLibraryMeta = {
    library_id: libraryId,
    key: lib.key,
    scope: lib.scope,
    parent_key: lib.parent_key ?? null,
    step_prefix: lib.step_prefix ?? null,
  };
  await client.query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, $3, 0, true, $4)
     ON CONFLICT (type, code)
     DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, updated_at = now()`,
    [TASK_LIBRARY_META_TYPE, lib.key, lib.name.slice(0, 255), JSON.stringify(meta)],
  );
  return libraryId;
}

async function runTaskLibrarySeed(): Promise<void> {
  verifySeedData();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cma_pms_task_library_seed'))`);
    const marker = await client.query<{ label: string }>(
      `SELECT label FROM reference_data
        WHERE type = 'system_setting' AND code = 'task_library_seed_version'
        LIMIT 1`,
    );
    if (marker.rows.length > 0 && marker.rows[0].label >= SEED_VERSION) {
      await client.query("COMMIT");
      return;
    }

    const all = [...STATUTORY_LIBRARIES, ...INTERNAL_AUDIT_LIBRARIES, ...OEM_LIBRARIES];
    const idsByKey = new Map<string, string>();
    // Base templates first so variants can point at them.
    for (const lib of all.filter((l) => !l.parent_key)) {
      idsByKey.set(lib.key, await insertLibrary(client, lib, null));
    }
    for (const lib of all.filter((l) => l.parent_key)) {
      idsByKey.set(lib.key, await insertLibrary(client, lib, idsByKey.get(lib.parent_key!) ?? null));
    }

    await client.query(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ('system_setting', 'task_library_seed_version', $1, 0, false, $2)
       ON CONFLICT (type, code)
       DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, updated_at = now()`,
      [SEED_VERSION, JSON.stringify({ seeded_at: new Date().toISOString(), libraries: all.length })],
    );
    await client.query("COMMIT");
    console.log("[task-library-seed] loaded %d libraries", all.length);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let librariesSeeded: Promise<void> | null = null;

/** Load the workbook libraries once per server process; retried if it fails. */
export async function ensureTaskLibrariesSeeded(): Promise<void> {
  if (isMockMode) return;
  if (!librariesSeeded) {
    librariesSeeded = runTaskLibrarySeed().catch((err) => {
      librariesSeeded = null;
      console.error("[task-library-seed] failed:", err);
    });
  }
  await librariesSeeded;
}
