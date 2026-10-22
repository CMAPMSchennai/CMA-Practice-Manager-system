/**
 * Edits to a task library (FR-09). A Partner makes a set of changes and saves
 * them together as the next version, with a note on why. This file holds the
 * change types and a pure function that applies them to a copy of the tree, so
 * the screen can preview the result and the server can describe what changed.
 * Client-safe: no server imports.
 */
export interface LibStep {
  id: string;
  step_code: string;
  name: string;
  description: string | null;
  sort_order: number;
  estimated_hours: number | null;
  default_assignee_role: string | null;
  is_new?: boolean;
}

export interface LibSubtask {
  id: string;
  name: string;
  sort_order: number;
  steps: LibStep[];
  is_new?: boolean;
}

export interface LibArea {
  id: string;
  name: string;
  sort_order: number;
  subtasks: LibSubtask[];
  is_new?: boolean;
}

export type LibOp =
  | { op: "update_step"; id: string; name?: string; description?: string | null; estimated_hours?: number | null; default_assignee_role?: string | null }
  | { op: "add_step"; subtask_id: string; temp_id: string; name: string; description?: string | null }
  | { op: "remove_step"; id: string }
  | { op: "move_step"; id: string; direction: "up" | "down" }
  | { op: "rename_area"; id: string; name: string }
  | { op: "rename_subtask"; id: string; name: string }
  | { op: "add_subtask"; area_id: string; temp_id: string; name: string }
  | { op: "add_area"; temp_id: string; name: string };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function findStep(tree: LibArea[], id: string) {
  for (const a of tree) for (const st of a.subtasks) {
    const i = st.steps.findIndex((s) => s.id === id);
    if (i >= 0) return { area: a, subtask: st, index: i, step: st.steps[i] };
  }
  return null;
}

function findSubtask(tree: LibArea[], id: string) {
  for (const a of tree) {
    const st = a.subtasks.find((s) => s.id === id);
    if (st) return { area: a, subtask: st };
  }
  return null;
}

/** Next step code in a sub-task, following the pattern of the last existing one. */
function nextCode(st: LibSubtask, taken: Set<string>): string {
  const last = st.steps[st.steps.length - 1]?.step_code;
  const m = last?.match(/^(.*?)(\d+)$/);
  let n = m ? parseInt(m[2], 10) : 0;
  const width = m ? m[2].length : 2;
  const stem = m ? m[1] : "NEW-";
  let code = "";
  do {
    n++;
    code = `${stem}${String(n).padStart(width, "0")}`;
  } while (taken.has(code));
  return code;
}

function renumber(list: { sort_order: number }[]) {
  list.forEach((x, i) => (x.sort_order = i + 1));
}

/** Apply the changes to a copy of the tree. Returns the new tree and one plain sentence per change. */
export function applyLibraryOps(tree: LibArea[], ops: LibOp[]): { tree: LibArea[]; changes: string[] } {
  const t = clone(tree);
  const changes: string[] = [];
  const taken = new Set<string>();
  for (const a of t) for (const st of a.subtasks) for (const s of st.steps) taken.add(s.step_code);

  for (const op of ops) {
    if (op.op === "update_step") {
      const f = findStep(t, op.id);
      if (!f) continue;
      const parts: string[] = [];
      if (op.name !== undefined && op.name !== f.step.name) {
        parts.push(`renamed "${f.step.name}" to "${op.name}"`);
        f.step.name = op.name;
      }
      if (op.description !== undefined && (op.description ?? "") !== (f.step.description ?? "")) {
        parts.push(`changed the reference / notes of "${f.step.name}"`);
        f.step.description = op.description;
      }
      if (op.estimated_hours !== undefined && op.estimated_hours !== f.step.estimated_hours) {
        parts.push(`set the estimated hours of "${f.step.name}" to ${op.estimated_hours ?? "none"}`);
        f.step.estimated_hours = op.estimated_hours;
      }
      if (op.default_assignee_role !== undefined && op.default_assignee_role !== f.step.default_assignee_role) {
        parts.push(`set the default role of "${f.step.name}" to ${op.default_assignee_role ?? "none"}`);
        f.step.default_assignee_role = op.default_assignee_role;
      }
      parts.forEach((p) => changes.push(p.charAt(0).toUpperCase() + p.slice(1) + "."));
    } else if (op.op === "add_step") {
      const f = findSubtask(t, op.subtask_id);
      if (!f) continue;
      const code = nextCode(f.subtask, taken);
      taken.add(code);
      f.subtask.steps.push({
        id: op.temp_id,
        step_code: code,
        name: op.name,
        description: op.description ?? null,
        sort_order: f.subtask.steps.length + 1,
        estimated_hours: null,
        default_assignee_role: null,
        is_new: true,
      });
      changes.push(`Added step ${code} "${op.name}" under "${f.subtask.name}".`);
    } else if (op.op === "remove_step") {
      const f = findStep(t, op.id);
      if (!f) continue;
      f.subtask.steps.splice(f.index, 1);
      renumber(f.subtask.steps);
      changes.push(`Removed step ${f.step.step_code} "${f.step.name}".`);
    } else if (op.op === "move_step") {
      const f = findStep(t, op.id);
      if (!f) continue;
      const to = op.direction === "up" ? f.index - 1 : f.index + 1;
      if (to < 0 || to >= f.subtask.steps.length) continue;
      const [s] = f.subtask.steps.splice(f.index, 1);
      f.subtask.steps.splice(to, 0, s);
      renumber(f.subtask.steps);
      changes.push(`Moved step ${s.step_code} "${s.name}" ${op.direction}.`);
    } else if (op.op === "rename_area") {
      const a = t.find((x) => x.id === op.id);
      if (!a || a.name === op.name) continue;
      changes.push(`Renamed area "${a.name}" to "${op.name}".`);
      a.name = op.name;
    } else if (op.op === "rename_subtask") {
      const f = findSubtask(t, op.id);
      if (!f || f.subtask.name === op.name) continue;
      changes.push(`Renamed sub-task "${f.subtask.name}" to "${op.name}".`);
      f.subtask.name = op.name;
    } else if (op.op === "add_subtask") {
      const a = t.find((x) => x.id === op.area_id);
      if (!a) continue;
      a.subtasks.push({ id: op.temp_id, name: op.name, sort_order: a.subtasks.length + 1, steps: [], is_new: true });
      changes.push(`Added sub-task "${op.name}" under "${a.name}".`);
    } else if (op.op === "add_area") {
      t.push({ id: op.temp_id, name: op.name, sort_order: t.length + 1, subtasks: [], is_new: true });
      changes.push(`Added area "${op.name}".`);
    }
  }
  // The same edit made twice reads as one change. Moves are kept: two moves are two places.
  const seen = new Set<string>();
  const unique = changes.filter((c) => {
    if (c.startsWith("Moved ")) return true;
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  return { tree: t, changes: unique };
}
