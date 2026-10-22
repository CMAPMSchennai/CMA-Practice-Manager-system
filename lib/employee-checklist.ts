/**
 * Employee onboarding document checklist (DM-03, FR-05, FR-42 — Gap #15).
 *
 * The PDF's 11 documents, conditional by position type:
 *   - ICAI items only for articled clerks (FR-05);
 *   - relieving letter and last 3 months' payslips only for paid staff —
 *     paid assistants and support staff (Gap #22).
 *
 * Items from the earlier checklist (offer letter, IT access, …) are kept in the
 * table as history with a `legacy_` code prefix and ignored everywhere (Gap #23).
 */
import type { PoolClient } from "pg";
import { pool, isMockMode, query } from "@/lib/db";

export const LEGACY_PREFIX = "legacy_";
const CHECKLIST_VERSION = "2";

type PositionType = "partner" | "paid_assistant" | "articled_clerk" | "support_staff" | string;

interface ChecklistItemDef {
  code: string;
  label: string;
  appliesTo: (position: PositionType) => boolean;
}

const ALL = () => true;
const ARTICLED_ONLY = (p: PositionType) => p === "articled_clerk";
const PAID_STAFF = (p: PositionType) => p === "paid_assistant" || p === "support_staff";

export const EMPLOYEE_CHECKLIST: ChecklistItemDef[] = [
  { code: "photographs", label: "Photographs (×2)", appliesTo: ALL },
  { code: "pan", label: "PAN card", appliesTo: ALL },
  { code: "aadhaar", label: "Aadhaar card", appliesTo: ALL },
  { code: "class_x_xii_marksheets", label: "Class X & XII marksheets", appliesTo: ALL },
  { code: "graduation_marksheets", label: "Graduation marksheets", appliesTo: ALL },
  { code: "ca_marksheets_certificates", label: "CA Foundation / Inter marksheets & certificates", appliesTo: ALL },
  { code: "icai_itt_orientation", label: "ICAI ITT & Orientation certificates", appliesTo: ARTICLED_ONLY },
  { code: "icai_registration_articleship", label: "ICAI Registration Letter / Articleship form", appliesTo: ARTICLED_ONLY },
  { code: "cancelled_cheque", label: "Cancelled cheque / passbook", appliesTo: ALL },
  { code: "relieving_letter", label: "Relieving letter", appliesTo: PAID_STAFF },
  { code: "payslips_last_3_months", label: "Last 3 months' payslips", appliesTo: PAID_STAFF },
];

/** Earlier items that clearly match a PDF item keep their tick (Gap #23). */
const LEGACY_EQUIVALENTS: Record<string, string> = {
  pan_card: "pan",
  aadhaar_card: "aadhaar",
  bank_details: "cancelled_cheque",
  passport_photo: "photographs",
};

export function checklistFor(position: PositionType): ChecklistItemDef[] {
  return EMPLOYEE_CHECKLIST.filter((i) => i.appliesTo(position));
}

/**
 * Bring one employee's checklist in line with their position type, inside the
 * caller's transaction: add missing items (carrying over matching legacy ticks)
 * and retire items that no longer apply.
 */
export async function syncEmployeeChecklist(
  client: PoolClient,
  employeeId: string,
  position: PositionType,
): Promise<void> {
  const existing = await client.query<{
    checklist_item_code: string;
    is_complete: boolean;
    completed_by: string | null;
    completed_at: string | null;
  }>(
    `SELECT checklist_item_code, is_complete, completed_by, completed_at
       FROM onboarding_checklist_items
      WHERE owner_type = 'employee' AND owner_id = $1`,
    [employeeId],
  );
  const byCode = new Map(existing.rows.map((r) => [r.checklist_item_code, r]));
  const required = checklistFor(position);
  const requiredCodes = new Set(required.map((i) => i.code));

  for (const item of required) {
    if (byCode.has(item.code)) continue;
    const legacyCode = Object.keys(LEGACY_EQUIVALENTS).find((k) => LEGACY_EQUIVALENTS[k] === item.code);
    const legacy =
      (legacyCode && (byCode.get(legacyCode) ?? byCode.get(`${LEGACY_PREFIX}${legacyCode}`))) || null;
    const carried = legacy?.is_complete === true;
    await client.query(
      `INSERT INTO onboarding_checklist_items
         (owner_type, owner_id, checklist_item_code, label, is_complete, completed_by, completed_at, notes)
       VALUES ('employee', $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (owner_type, owner_id, checklist_item_code) DO NOTHING`,
      [
        employeeId,
        item.code,
        item.label,
        carried,
        carried ? legacy?.completed_by ?? null : null,
        carried ? legacy?.completed_at ?? null : null,
        carried ? `Carried over from earlier checklist item "${legacyCode}"` : null,
      ],
    );
  }

  // Retire anything not on this employee's PDF checklist, keeping it as history.
  for (const row of existing.rows) {
    const code = row.checklist_item_code;
    if (requiredCodes.has(code) || code.startsWith(LEGACY_PREFIX)) continue;
    await client.query(
      `UPDATE onboarding_checklist_items
          SET checklist_item_code = $3,
              notes = trim(both ' ' from concat_ws(' ', notes, $4::text)),
              updated_at = now()
        WHERE owner_type = 'employee' AND owner_id = $1 AND checklist_item_code = $2`,
      [
        employeeId,
        code,
        `${LEGACY_PREFIX}${code}`.slice(0, 50),
        "[Superseded by the requirements checklist (FR-42)]",
      ],
    );
  }
}

async function migrateAllEmployees(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cma_pms_employee_checklist'))`);
    const marker = await client.query<{ label: string }>(
      `SELECT label FROM reference_data
        WHERE type = 'system_setting' AND code = 'employee_checklist_version'
        LIMIT 1`,
    );
    if (marker.rows.length > 0 && marker.rows[0].label >= CHECKLIST_VERSION) {
      await client.query("COMMIT");
      return;
    }
    const employees = await client.query<{ id: string; position_type: string }>(
      `SELECT id, position_type FROM employees`,
    );
    for (const e of employees.rows) {
      await syncEmployeeChecklist(client, e.id, e.position_type);
    }
    await client.query(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ('system_setting', 'employee_checklist_version', $1, 0, false, $2)
       ON CONFLICT (type, code)
       DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, updated_at = now()`,
      [CHECKLIST_VERSION, JSON.stringify({ migrated_at: new Date().toISOString(), employees: employees.rows.length })],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let checklistsMigrated: Promise<void> | null = null;

/** One-time move of every employee to the PDF checklist; retried if it fails. */
export async function ensureEmployeeChecklistsMigrated(): Promise<void> {
  if (isMockMode) return;
  if (!checklistsMigrated) {
    checklistsMigrated = migrateAllEmployees().catch((err) => {
      checklistsMigrated = null;
      console.error("[employee-checklist] migration failed:", err);
    });
  }
  await checklistsMigrated;
}

/** Sync a single employee (e.g. right after creation) in its own transaction. */
export async function syncEmployeeChecklistNow(employeeId: string): Promise<void> {
  const rows = await query<{ position_type: string }>(
    `SELECT position_type FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId],
  );
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await syncEmployeeChecklist(client, employeeId, rows[0].position_type);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
