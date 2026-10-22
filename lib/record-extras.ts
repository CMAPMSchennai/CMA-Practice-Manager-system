/**
 * Extra details for clients and employees that come from the firm's workbook
 * but have no database column yet (Gaps #38, #40): e.g. client city / PIN / CIN /
 * FY end, employee blood group / emergency contact / academics, plus any new
 * column the MP adds to the workbook. Also holds `name_as_imported` (§11.3) and
 * import flags such as "profile incomplete" or "values to collect".
 *
 * Stored in reference_data (type 'record_extra', code '<owner>:<id>') until
 * schema changes are possible again (Dual7 migration 0042); then these move to
 * proper columns.
 */
import { query } from "@/lib/db";

export const RECORD_EXTRA_TYPE = "record_extra";

export type ExtraOwner = "client" | "employee";

export interface RecordExtras {
  /** Workbook column header → value, as text. */
  fields: Record<string, string>;
  name_as_imported?: string | null;
  profile_incomplete?: boolean;
  /** Fields the workbook marked "NA" / "Not available" — to collect (§11.3). */
  to_collect?: string[];
  /** Notes from the importer, e.g. unmatched services or entity type. */
  import_notes?: string[];
}

/**
 * FR-04: bank and compensation details are visible only to MP, Partner and
 * Admin (and the employee themself). These workbook columns are filtered out
 * for everyone else.
 */
export const RESTRICTED_EMPLOYEE_EXTRAS = new Set([
  "Name as per Bank",
  "Bank Name",
  "Branch",
  "Last Drawn CTC (INR)",
]);

function code(owner: ExtraOwner, id: string): string {
  return `${owner}:${id}`;
}

export async function getExtras(owner: ExtraOwner, id: string): Promise<RecordExtras | null> {
  const rows = await query<{ metadata: RecordExtras | null }>(
    `SELECT metadata FROM reference_data WHERE type = $1 AND code = $2 LIMIT 1`,
    [RECORD_EXTRA_TYPE, code(owner, id)],
  );
  return rows[0]?.metadata ?? null;
}

export async function getExtrasMany(owner: ExtraOwner, ids: string[]): Promise<Map<string, RecordExtras>> {
  const out = new Map<string, RecordExtras>();
  if (ids.length === 0) return out;
  const rows = await query<{ code: string; metadata: RecordExtras | null }>(
    `SELECT code, metadata FROM reference_data WHERE type = $1 AND code = ANY($2::text[])`,
    [RECORD_EXTRA_TYPE, ids.map((id) => code(owner, id))],
  );
  for (const r of rows) if (r.metadata) out.set(r.code.slice(owner.length + 1), r.metadata);
  return out;
}

/** Replace an owner's extras. */
export async function putExtras(owner: ExtraOwner, id: string, extras: RecordExtras): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, 'Imported details', 0, true, $3::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [RECORD_EXTRA_TYPE, code(owner, id), JSON.stringify(extras)],
  );
}

export async function deleteExtras(owner: ExtraOwner, id: string): Promise<void> {
  await query(`DELETE FROM reference_data WHERE type = $1 AND code = $2`, [RECORD_EXTRA_TYPE, code(owner, id)]);
}

/** Extras for display, with FR-04 restricted employee fields removed when not allowed. */
export function visibleExtras(
  owner: ExtraOwner,
  extras: RecordExtras | null,
  canSeeRestricted: boolean,
): RecordExtras | null {
  if (!extras) return null;
  if (owner !== "employee" || canSeeRestricted) return extras;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(extras.fields ?? {})) {
    if (!RESTRICTED_EMPLOYEE_EXTRAS.has(k)) fields[k] = v;
  }
  return { ...extras, fields };
}
