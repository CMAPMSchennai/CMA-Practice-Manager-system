/**
 * Which services are checklist jobs and which are simple one-step jobs.
 *
 * The firm marked each service as "Checklist" or "Simple Job" in its workbook (Service Types
 * sheet, V2). This is stored as one hidden row in reference_data (type 'system_setting',
 * code 'service_job_types') holding { service_id: "checklist" | "simple" }, so the Managing
 * Partner or Admin can change any service in the Service Type Catalogue. A service with no entry
 * is "ask": whoever creates the job chooses, as before (Gap #78).
 */
import { query } from "@/lib/db";

export type JobType = "checklist" | "simple";

const CODE = "service_job_types";

/** Service names are matched ignoring case, spacing and spaces around "/". */
export function normName(s: string): string {
  return s.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

/** The firm's marking, from "V2_CMA Workflow Automation.xlsx", sheet "Service Types" (58 services). */
const FIRM_JOB_TYPES: [string, JobType][] = [
  ["Statutory audit Co", "checklist"],
  ["Tax Audit", "checklist"],
  ["Transaction cost Audit", "simple"],
  ["SBA", "simple"],
  ["Concurrent Audit", "checklist"],
  ["Internal audit Co", "checklist"],
  ["OEM Operational audit", "checklist"],
  ["MIS", "checklist"],
  ["Tally Accounting", "simple"],
  ["Back office", "checklist"],
  ["CO formation", "checklist"],
  ["ROC", "simple"],
  ["IT filing", "checklist"],
  ["GST Calculation", "simple"],
  ["GST filing", "checklist"],
  ["TDS Monthly calculation", "checklist"],
  ["TDS Qtr return", "checklist"],
  ["15 CA/CB", "checklist"],
  ["Networth Certificate", "simple"],
  ["ROC certificates", "simple"],
  ["Customs Certificate", "simple"],
  ["APR filing", "checklist"],
  ["FEMA FLA Returns", "checklist"],
  ["11UA Valuation", "checklist"],
  ["Sec 285 certificate", "checklist"],
  ["Retainer", "checklist"],
  ["Stock Audit", "checklist"],
  ["Verification of Gold Loan", "checklist"],
  ["PAN Application", "checklist"],
  ["PAN Application NRI", "checklist"],
  ["LLP Formation", "checklist"],
  ["Partnership deed", "checklist"],
  ["Partnership Formation", "checklist"],
  ["DSC", "checklist"],
  ["GST Refund", "checklist"],
  ["Capital Gains calculation", "checklist"],
  ["Deputation Charges", "simple"],
  ["Accounting", "simple"],
  ["LLP Filing", "checklist"],
  ["Valuation Report IT", "checklist"],
  ["Valuation Report ROC", "checklist"],
  ["Valuation of shares", "checklist"],
  ["Trade mark certificate", "simple"],
  ["Turnover Certificate", "checklist"],
  ["Book Stock certificate", "simple"],
  ["Due Diligence certificate", "checklist"],
  ["Form 8 Signing", "simple"],
  ["No Due certificate Statutory", "simple"],
  ["End use certificate", "simple"],
  ["List of Shareholders", "simple"],
  ["List of Directors", "simple"],
  ["Reimbursement ROC", "simple"],
  ["Reimbursement GST fees", "simple"],
  ["Reimbursement Others", "simple"],
  ["Reimbursement travel", "simple"],
  ["Reimbursement Food", "simple"],
  ["Non Statutory Audit Others", "checklist"],
  ["Voluntary Audit", "checklist"],
];

async function seedFromFirmSheet(): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  if (existing.length > 0) return;

  const services = await query<{ id: string; name: string; is_active: boolean }>(
    `SELECT id, name, is_active FROM service_types`,
  );
  const byName = new Map<string, { id: string; is_active: boolean }>();
  for (const s of services) {
    const k = normName(s.name);
    const cur = byName.get(k);
    if (!cur || (!cur.is_active && s.is_active)) byName.set(k, { id: s.id, is_active: s.is_active });
  }
  const map: Record<string, JobType> = {};
  for (const [name, type] of FIRM_JOB_TYPES) {
    const hit = byName.get(normName(name));
    if (hit) map[hit.id] = type;
  }
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'Job type of each service (checklist or simple)', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO NOTHING`,
    [CODE, JSON.stringify({ map, seeded_from: "firm workbook V2, Service Types sheet" })],
  );
}

/** service id -> "checklist" | "simple". A service that is missing is "ask". */
export async function getJobTypes(): Promise<Record<string, JobType>> {
  await seedFromFirmSheet();
  const rows = await query<{ metadata: { map?: Record<string, string> } | null }>(
    `SELECT metadata FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  const raw = rows[0]?.metadata?.map ?? {};
  const out: Record<string, JobType> = {};
  for (const [id, v] of Object.entries(raw)) if (v === "checklist" || v === "simple") out[id] = v;
  return out;
}

export async function saveJobTypes(map: Record<string, JobType>): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'Job type of each service (checklist or simple)', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [CODE, JSON.stringify({ map })],
  );
}
