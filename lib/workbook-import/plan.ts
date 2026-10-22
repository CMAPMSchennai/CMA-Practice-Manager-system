/**
 * FR-83 dry run: turns the workbook into an import plan without writing.
 *
 * Scope (§11.1, §11.2): Employee Master, Client Master. (93 enriched) merged
 * with the hidden Client Master (261 names), and client-service scope.
 * Entities, services and task libraries are already loaded by the app.
 *
 * Rules from §11.3 and the decided Gaps:
 *  - duplicate client names go to a review list, never merged silently;
 *  - entity types are normalised to DM-02a; unknown variants are reported;
 *  - all-upper / all-lower client names become Title Case, original kept as
 *    name_as_imported;
 *  - sparse client data is imported as-is (onboarding gap, not an error);
 *  - "NA" / "Not available" become empty and are flagged to collect;
 *  - Excel serial dates are converted;
 *  - Scope of Services is split on commas and matched to services; unmatched
 *    values are reported;
 *  - the 168 name-only clients are imported and flagged profile-incomplete;
 *  - existing records: changes are shown and applied only when approved (Gap #41);
 *    empty workbook cells never blank existing values;
 *  - records in the app but not in the file are only reported (Gap #42);
 *  - unknown columns are kept as extra details (Gaps #38, #40).
 */
import type ExcelJS from "exceljs";
import { query } from "@/lib/db";
import { decryptField } from "@/lib/field-crypto";
import { readEmployeeSalaries } from "@/lib/secure-fields";
import { getExtrasMany, type RecordExtras } from "@/lib/record-extras";
import {
  digitsText,
  findSheet,
  isNotAvailable,
  normaliseHeader,
  readTable,
  text,
  toDate,
  toNumber,
  type SheetRow,
} from "@/lib/workbook-import/read";

export const SHEET_EMPLOYEES = "Employee Master";
export const SHEET_CLIENTS = "Client Master.";
export const SHEET_CLIENT_NAMES = "Client Master";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface FieldChange {
  label: string;
  before: string | null;
  after: string | null;
  /** Shown masked (last 4) in the report. */
  sensitive?: boolean;
}

export type PlanAction = "create" | "update" | "unchanged" | "review" | "error";

export interface EmployeePayload {
  columns: {
    employee_id_code: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    position_type: string;
    status: string;
    date_of_joining: string | null;
    payroll_entity_id: string;
    bank_ifsc: string | null;
    icai_registration_no: string | null;
  };
  /** Plain values; encrypted when applied. Only keys with a value are present. */
  secrets: Partial<Record<"pan" | "aadhaar" | "bank_account_no" | "salary", string>>;
  extras: RecordExtras;
}

export interface ClientPayload {
  columns: {
    name: string;
    entity_type_id: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pin: string | null;
    contact_person: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    gstin: string | null;
    partner_in_charge_id: string | null;
    notes: string | null;
  };
  pan: string | null;
  scope_service_ids: string[];
  extras: RecordExtras;
}

export interface PlanItem {
  /** Approval key: "employee:<id>" / "client:<id>" for updates, "dup:<sheet>:<row>" for duplicates. */
  key: string;
  kind: "employee" | "client";
  sheet: string;
  row: number;
  name: string;
  action: PlanAction;
  existing_id?: string;
  changes?: FieldChange[];
  errors?: string[];
  warnings?: string[];
  /** Internal only — never sent to the browser. */
  employee?: EmployeePayload;
  client?: ClientPayload;
}

export interface ImportPlan {
  employees: PlanItem[];
  clients: PlanItem[];
  missing: { kind: "employee" | "client"; id: string; name: string; code: string | null }[];
  unmatched_services: { value: string; count: number }[];
  unmatched_entity_types: { value: string; count: number }[];
  sheet_errors: string[];
  new_columns: string[];
}

/* ------------------------------------------------------------------ */
/*  Column maps                                                       */
/* ------------------------------------------------------------------ */

const C = {
  name: "Client Name (Legal Name of Entity)",
  type: "Entity Type / Constitution",
  address: "Registered Office Address",
  city: "City",
  state: "State",
  pin: "Pin / Zip Code",
  contactName: "Contact - Full Name",
  contactEmail: "Contact - Email",
  contactPhone: "Contact - Phone / Mobile",
  pan: "PAN / Tax ID",
  gstin: "GSTIN",
  scope: "Scope of Services Required",
  partner: "Partner-in-Charge",
  remarks: "Remarks / Notes",
  serial: "S.no",
};
const CLIENT_MAPPED = new Set([C.name, C.type, C.address, C.city, C.state, C.pin, C.contactName, C.contactEmail,
  C.contactPhone, C.pan, C.gstin, C.partner, C.remarks, C.serial]);
const CLIENT_KNOWN = new Set([...CLIENT_MAPPED, "Date of Incorporation", "Registration No. (CIN / LLPIN)",
  "Contact - Designation", "Preferred Communication", "Financial Year End (Month)",
  "Preferred Billing Email", C.scope, "Doc - Certificate of Incorporation", "Doc - LLP Agreement / Deed / MoA & AoA",
  "Doc - PAN Card (Entity)", "Doc - GST Registration Certificate", "Doc - KYC/ID Proof (Signatory/Partners)",
  "Doc - Cancelled Cheque / Bank Details", "KYC Verified", "Onboarding Date"]);

const E = {
  id: "Emp ID",
  name: "Full Name (as per PAN/Aadhaar)",
  position: "Position Type",
  status: "Employment Status",
  joined: "Date of Joining",
  entity: "Payroll Entity",
  salary: "Monthly Gross Salary / Stipend (INR)",
  mobile: "Mobile Number",
  pan: "PAN",
  aadhaar: "Aadhaar Number",
  srn: "ICAI SRN (Articled Clerks)",
  account: "Account Number",
  ifsc: "IFSC Code",
};
const EMPLOYEE_MAPPED = new Set(Object.values(E));
const EMPLOYEE_KNOWN = new Set([...EMPLOYEE_MAPPED, "Category", "Date of Birth", "Gender", "Blood Group",
  "Father's / Guardian's Name", "Permanent Address", "Permanent PIN", "Current Residential Address", "Current PIN",
  "Alternative Contact No.", "Personal Email ID", "Highest Qualification", "CA Stage / Level", "ITT Completed",
  "Orientation Completed", "Previous Firm / Organization", "Previous Designation", "Last Drawn CTC (INR)",
  "Name as per Bank", "Bank Name", "Branch", "Emergency Contact Name", "Relationship", "Emergency Mobile No."]);

/** DM-03 position types → app values. "Other" has no app value yet. */
const POSITION_MAP: Record<string, string> = {
  "articled clerk": "articled_clerk",
  "paid assistant / audit staff": "paid_assistant",
  "paid assistant": "paid_assistant",
  "admin / support staff": "support_staff",
  partner: "partner",
};
/** DM-03 statuses → app values. "Absconding" has no app value yet. */
const STATUS_MAP: Record<string, string> = {
  active: "active",
  "on leave": "on_leave",
  resigned: "resigned",
  terminated: "terminated",
};

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Key for matching names: case, spacing and punctuation don't matter. */
export function nameKey(s: string): string {
  return s.toLowerCase().replace(/[.,'"()]/g, " ").replace(/&/g, " and ").replace(/\s+/g, " ").trim();
}

function serviceKey(s: string): string {
  return s.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

const KEEP_UPPER = new Set(["LLP", "OPC", "HUF", "II", "III", "IV", "IT", "GST", "MIS", "ROC", "TDS", "CA", "CB",
  "FTWZ", "SBI", "HDFC", "ICICI", "IDFC", "UCO", "IOB", "LIC", "NBFC", "BPO", "KPO", "USA", "UK", "UAE"]);
const KEEP_LOWER = new Set(["of", "and", "the", "for", "in", "on", "at", "by", "to"]);

/** §11.3: only names written all upper-case or all lower-case are re-cased. */
export function tidyName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s;
  return s
    .split(" ")
    .map((word, i) =>
      word.replace(/[A-Za-z][A-Za-z']*/g, (w) => {
        const up = w.toUpperCase();
        if (KEEP_UPPER.has(up)) return up;
        if (i > 0 && KEEP_LOWER.has(w.toLowerCase())) return w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }),
    )
    .join(" ");
}

function show(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s ? s : null;
}

function differs(a: unknown, b: unknown): boolean {
  return (show(a) ?? "") !== (show(b) ?? "");
}

/** Extras from every column that isn't mapped to a database field. */
function extrasFrom(row: SheetRow, mapped: Set<string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [header, value] of Object.entries(row.values)) {
    if (mapped.has(header)) continue;
    const v = /date/i.test(header) ? toDate(value) ?? text(value) : text(value);
    if (v !== null) fields[header] = v;
  }
  return fields;
}

/* ------------------------------------------------------------------ */
/*  Reference data                                                    */
/* ------------------------------------------------------------------ */

async function loadLookups() {
  const entityTypes = await query<{ id: string; label: string; metadata: { import_aliases?: string[] } | null }>(
    `SELECT id, label, metadata FROM reference_data WHERE type = 'entity_type' AND is_active = true`,
  );
  const entityTypeByKey = new Map<string, string>();
  for (const t of entityTypes) {
    entityTypeByKey.set(nameKey(t.label), t.id);
    for (const a of t.metadata?.import_aliases ?? []) entityTypeByKey.set(nameKey(a), t.id);
  }

  const services = await query<{ id: string; name: string }>(
    `SELECT id, name FROM service_types WHERE is_active = true`,
  );
  const serviceByKey = new Map<string, string>();
  for (const s of services) if (!serviceByKey.has(serviceKey(s.name))) serviceByKey.set(serviceKey(s.name), s.id);

  const entities = await query<{ id: string; name: string; short_code: string; metadata: { display_code?: string } | null }>(
    `SELECT id, name, short_code, metadata FROM entities`,
  );
  const entityByKey = new Map<string, string>();
  for (const e of entities) {
    entityByKey.set(nameKey(e.name), e.id);
    entityByKey.set(nameKey(e.short_code), e.id);
    if (e.metadata?.display_code) entityByKey.set(nameKey(e.metadata.display_code), e.id);
  }

  const partners = await query<{ id: string; name: string | null }>(
    `SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('partner', 'managing_partner') AND u.is_active = true`,
  );
  const partnerByKey = new Map<string, string>();
  for (const p of partners) if (p.name) partnerByKey.set(nameKey(p.name), p.id);

  return { entityTypeByKey, serviceByKey, entityByKey, partnerByKey };
}

/* ------------------------------------------------------------------ */
/*  Employees                                                         */
/* ------------------------------------------------------------------ */

interface ExistingEmployee {
  id: string;
  employee_id_code: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  position_type: string;
  status: string;
  date_of_joining: string | Date | null;
  payroll_entity_id: string;
  bank_ifsc: string | null;
  icai_registration_no: string | null;
  pan: string | null;
  aadhaar: string | null;
  bank_account_no: string | null;
  salary: string | number | null;
}

async function planEmployees(
  rows: SheetRow[],
  lookups: Awaited<ReturnType<typeof loadLookups>>,
): Promise<{ items: PlanItem[]; matchedIds: Set<string> }> {
  const existing = await query<ExistingEmployee>(
    `SELECT id, employee_id_code, first_name, last_name, phone, position_type, status, date_of_joining,
            payroll_entity_id, bank_ifsc, icai_registration_no, pan, aadhaar, bank_account_no, salary
       FROM employees`,
  );
  const byCode = new Map(existing.map((e) => [e.employee_id_code.toUpperCase(), e]));
  const salaries = await readEmployeeSalaries(existing.map((e) => e.id), new Map(existing.map((e) => [e.id, e.salary])));
  const extrasById = await getExtrasMany("employee", existing.map((e) => e.id));

  const items: PlanItem[] = [];
  const matchedIds = new Set<string>();
  const seenCodes = new Set<string>();

  for (const r of rows) {
    const v = r.values;
    const code = text(v[E.id])?.toUpperCase() ?? null;
    const fullName = text(v[E.name]);
    const errors: string[] = [];
    const warnings: string[] = [];
    const toCollect: string[] = [];

    if (!code) errors.push("Emp ID is missing");
    if (!fullName) errors.push("Full name is missing");
    if (code && seenCodes.has(code)) errors.push(`Emp ID ${code} appears more than once in the file`);
    if (code) seenCodes.add(code);

    const positionRaw = text(v[E.position]);
    const position = positionRaw ? POSITION_MAP[positionRaw.toLowerCase()] : undefined;
    if (!positionRaw) errors.push("Position Type is missing");
    else if (!position) errors.push(`Position Type "${positionRaw}" isn't supported in the app yet`);

    const statusRaw = text(v[E.status]) ?? "Active";
    const status = STATUS_MAP[statusRaw.toLowerCase()];
    if (!status) errors.push(`Employment Status "${statusRaw}" isn't supported in the app yet`);

    const entityRaw = text(v[E.entity]);
    const payrollEntityId = entityRaw ? lookups.entityByKey.get(nameKey(entityRaw)) : undefined;
    if (!entityRaw) errors.push("Payroll Entity is missing");
    else if (!payrollEntityId) errors.push(`Payroll Entity "${entityRaw}" doesn't match CMA LLP, SGC or GMC`);

    const secrets: EmployeePayload["secrets"] = {};
    const pick = (header: string, label: string): unknown => {
      if (isNotAvailable(v[header])) {
        toCollect.push(label);
        return null;
      }
      return v[header];
    };

    const pan = text(pick(E.pan, "PAN"))?.toUpperCase().replace(/\s/g, "") ?? null;
    if (pan) {
      if (PAN_RE.test(pan)) secrets.pan = pan;
      else warnings.push("PAN isn't in the AAAAA9999A format — left empty, to collect");
    }
    const aadhaar = digitsText(pick(E.aadhaar, "Aadhaar"));
    if (aadhaar) {
      if (aadhaar.length === 12) secrets.aadhaar = aadhaar;
      else warnings.push("Aadhaar isn't 12 digits — left empty, to collect");
    }
    const account = digitsText(pick(E.account, "Bank account number"));
    if (account) secrets.bank_account_no = account;
    const salary = toNumber(pick(E.salary, "Monthly salary / stipend"));
    if (salary !== null) secrets.salary = String(salary);
    const ifscRaw = text(pick(E.ifsc, "IFSC"))?.toUpperCase() ?? null;
    let ifsc: string | null = null;
    if (ifscRaw) {
      if (IFSC_RE.test(ifscRaw)) ifsc = ifscRaw;
      else warnings.push("IFSC isn't in the standard 11-character format — left empty");
    }

    const phone = digitsText(pick(E.mobile, "Mobile"));
    const srn = text(pick(E.srn, "ICAI SRN"));

    const joinedRaw = v[E.joined];
    const joined = toDate(joinedRaw);
    if (text(joinedRaw) && !joined) warnings.push("Date of Joining couldn't be read — left empty");

    const parts = (fullName ?? "").split(" ");
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null;

    const extras: RecordExtras = { fields: extrasFrom(r, EMPLOYEE_MAPPED), to_collect: toCollect };

    const item: PlanItem = {
      key: `new-employee:${r.row}`,
      kind: "employee",
      sheet: SHEET_EMPLOYEES,
      row: r.row,
      name: fullName ? `${fullName}${code ? ` (${code})` : ""}` : code ?? `Row ${r.row}`,
      action: errors.length ? "error" : "create",
      errors: errors.length ? errors : undefined,
      warnings: [...warnings, ...(toCollect.length ? [`To collect: ${toCollect.join(", ")}`] : [])],
    };

    if (!errors.length && code && position && status && payrollEntityId && fullName) {
      item.employee = {
        columns: {
          employee_id_code: code,
          first_name: firstName,
          last_name: lastName,
          phone,
          position_type: position,
          status,
          date_of_joining: joined,
          payroll_entity_id: payrollEntityId,
          bank_ifsc: ifsc,
          icai_registration_no: srn,
        },
        secrets,
        extras,
      };

      const match = byCode.get(code);
      if (match) {
        matchedIds.add(match.id);
        const changes: FieldChange[] = [];
        const cols = item.employee.columns;
        const compare: [keyof typeof cols, string][] = [
          ["first_name", "First name"], ["last_name", "Last name"], ["phone", "Mobile"],
          ["position_type", "Position"], ["status", "Status"], ["date_of_joining", "Date of joining"],
          ["payroll_entity_id", "Payroll entity"], ["bank_ifsc", "IFSC"], ["icai_registration_no", "ICAI SRN"],
        ];
        for (const [field, label] of compare) {
          const after = cols[field];
          if (after !== null && differs(match[field as keyof ExistingEmployee], after)) {
            changes.push({ label, before: show(match[field as keyof ExistingEmployee]), after: show(after) });
          }
        }
        const current = {
          pan: decryptField(match.pan),
          aadhaar: decryptField(match.aadhaar),
          bank_account_no: decryptField(match.bank_account_no),
          salary: salaries.get(match.id) ?? null,
        };
        const secretLabels = { pan: "PAN", aadhaar: "Aadhaar", bank_account_no: "Bank account no.", salary: "Salary" };
        for (const [field, value] of Object.entries(secrets) as [keyof typeof secretLabels, string][]) {
          const before = current[field];
          if (differs(before, value) && !(field === "salary" && Number(before) === Number(value))) {
            changes.push({ label: secretLabels[field], before: show(before), after: value, sensitive: true });
          }
        }
        const oldExtras = extrasById.get(match.id)?.fields ?? {};
        for (const [k, val] of Object.entries(extras.fields)) {
          if (differs(oldExtras[k], val)) changes.push({ label: k, before: oldExtras[k] ?? null, after: val });
        }
        item.existing_id = match.id;
        item.key = `employee:${match.id}`;
        item.action = changes.length ? "update" : "unchanged";
        item.changes = changes;
      }
    }
    if (item.warnings && item.warnings.length === 0) delete item.warnings;
    items.push(item);
  }
  return { items, matchedIds };
}

/* ------------------------------------------------------------------ */
/*  Clients                                                           */
/* ------------------------------------------------------------------ */

interface ExistingClient {
  id: string;
  client_code: string;
  name: string;
  entity_type_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  gstin: string | null;
  partner_in_charge_id: string | null;
  notes: string | null;
  pan: string | null;
}

async function planClients(
  enriched: SheetRow[],
  names: SheetRow[],
  lookups: Awaited<ReturnType<typeof loadLookups>>,
  unmatchedServices: Map<string, number>,
  unmatchedTypes: Map<string, number>,
): Promise<{ items: PlanItem[]; matchedIds: Set<string> }> {
  const existing = await query<ExistingClient>(
    `SELECT id, client_code, name, entity_type_id, address, city, state, pin, contact_person, contact_email,
            contact_phone, gstin, partner_in_charge_id, notes, pan
       FROM clients`,
  );
  const extrasById = await getExtrasMany("client", existing.map((c) => c.id));
  const existingByKey = new Map<string, ExistingClient>();
  for (const c of existing) {
    for (const n of [c.name, extrasById.get(c.id)?.name_as_imported]) {
      if (n && !existingByKey.has(nameKey(n))) existingByKey.set(nameKey(n), c);
    }
  }
  const scopeRows = await query<{ client_id: string; service_type_id: string }>(
    `SELECT client_id, service_type_id FROM client_service_scope`,
  );
  const scopeByClient = new Map<string, Set<string>>();
  for (const s of scopeRows) {
    if (!scopeByClient.has(s.client_id)) scopeByClient.set(s.client_id, new Set());
    scopeByClient.get(s.client_id)!.add(s.service_type_id);
  }

  const items: PlanItem[] = [];
  const matchedIds = new Set<string>();
  const seen = new Map<string, string>(); // name key → "sheet row" of first occurrence

  const entityTypeFor = (raw: string | null, warnings: string[]): string | null => {
    if (!raw) return null;
    const id = lookups.entityTypeByKey.get(nameKey(raw));
    if (!id) {
      unmatchedTypes.set(raw, (unmatchedTypes.get(raw) ?? 0) + 1);
      warnings.push(`Entity type "${raw}" doesn't match the DM-02a list — left empty`);
    }
    return id ?? null;
  };

  const build = (row: SheetRow, sheet: string, enrichedRow: boolean): PlanItem => {
    const v = row.values;
    const raw = text(enrichedRow ? v[C.name] : v["Name of the Company"]) ?? "";
    const errors: string[] = [];
    const warnings: string[] = [];
    const notes: string[] = [];
    if (!raw) errors.push("Client name is missing");

    const name = tidyName(raw);
    const typeRaw = text(enrichedRow ? v[C.type] : v["Type"]);
    const entityTypeId = entityTypeFor(typeRaw, warnings);

    const pickText = (header: string): string | null => (isNotAvailable(v[header]) ? null : text(v[header]));

    let pan: string | null = null;
    const scopeIds: string[] = [];
    let partnerId: string | null = null;
    let extrasFields: Record<string, string> = {};

    if (enrichedRow) {
      const p = pickText(C.pan)?.toUpperCase().replace(/\s/g, "") ?? null;
      if (p) {
        if (PAN_RE.test(p)) pan = p;
        else warnings.push("PAN isn't in the AAAAA9999A format — left empty");
      }
      const scopeText = text(v[C.scope]);
      if (scopeText) {
        for (const token of scopeText.split(",").map((t) => t.trim()).filter(Boolean)) {
          const id = lookups.serviceByKey.get(serviceKey(token));
          if (id) {
            if (!scopeIds.includes(id)) scopeIds.push(id);
          } else {
            unmatchedServices.set(token, (unmatchedServices.get(token) ?? 0) + 1);
            notes.push(`Service not matched: ${token}`);
          }
        }
      }
      const partnerName = pickText(C.partner);
      if (partnerName) {
        partnerId = lookups.partnerByKey.get(nameKey(partnerName)) ?? null;
        if (!partnerId) warnings.push(`Partner-in-charge "${partnerName}" has no login yet — kept as a note`);
      }
      extrasFields = extrasFrom(row, CLIENT_MAPPED);
      if (partnerName && !partnerId) extrasFields[C.partner] = partnerName;
      const gst = pickText(C.gstin)?.toUpperCase() ?? null;
      if (gst && gst.length > 15) errors.push(`GSTIN has ${gst.length} characters; it must be exactly 15. Correct it in the workbook.`);
      else if (gst && !GSTIN_RE.test(gst)) warnings.push("GSTIN isn't in the standard 15-character format");
    }

    const extras: RecordExtras = {
      fields: extrasFields,
      name_as_imported: raw !== name ? raw : null,
      profile_incomplete: !enrichedRow,
      import_notes: notes.length ? notes : undefined,
    };

    const payload: ClientPayload = {
      columns: {
        name,
        entity_type_id: entityTypeId,
        address: enrichedRow ? pickText(C.address) : null,
        city: enrichedRow ? pickText(C.city) : null,
        state: enrichedRow ? pickText(C.state) : null,
        pin: enrichedRow ? digitsText(isNotAvailable(v[C.pin]) ? null : v[C.pin]) : null,
        contact_person: enrichedRow ? pickText(C.contactName) : null,
        contact_email: enrichedRow ? pickText(C.contactEmail) : null,
        contact_phone: enrichedRow ? digitsText(isNotAvailable(v[C.contactPhone]) ? null : v[C.contactPhone]) : null,
        gstin: enrichedRow ? pickText(C.gstin)?.toUpperCase() ?? null : null,
        partner_in_charge_id: partnerId,
        notes: enrichedRow ? pickText(C.remarks) : null,
      },
      pan,
      scope_service_ids: scopeIds,
      extras,
    };

    return {
      key: `new-client:${sheet}:${row.row}`,
      kind: "client",
      sheet,
      row: row.row,
      name: name || `Row ${row.row}`,
      action: errors.length ? "error" : "create",
      errors: errors.length ? errors : undefined,
      warnings: [...warnings, ...(enrichedRow ? [] : ["Name and type only — profile incomplete"])],
      client: errors.length ? undefined : payload,
    };
  };

  const consider = (item: PlanItem) => {
    if (item.action === "error" || !item.client) {
      items.push(item);
      return;
    }
    const key = nameKey(item.client.columns.name);
    const first = seen.get(key);
    if (first) {
      item.action = "review";
      item.key = `dup:${item.sheet}:${item.row}`;
      item.warnings = [...(item.warnings ?? []), `Same name as ${first} — held for review, not merged`];
      items.push(item);
      return;
    }
    seen.set(key, `${item.sheet} row ${item.row}`);

    const match = existingByKey.get(key);
    if (match) {
      matchedIds.add(match.id);
      const cols = item.client.columns;
      const changes: FieldChange[] = [];
      const compare: [keyof typeof cols, string][] = [
        ["entity_type_id", "Entity type"], ["address", "Address"], ["city", "City"], ["state", "State"],
        ["pin", "PIN"], ["contact_person", "Contact name"],
        ["contact_email", "Contact email"], ["contact_phone", "Contact phone"], ["gstin", "GSTIN"],
        ["partner_in_charge_id", "Partner-in-charge"], ["notes", "Remarks"],
      ];
      for (const [field, label] of compare) {
        const after = cols[field];
        if (after !== null && differs(match[field as keyof ExistingClient], after)) {
          changes.push({ label, before: show(match[field as keyof ExistingClient]), after: show(after) });
        }
      }
      if (item.client.pan && differs(decryptField(match.pan), item.client.pan)) {
        changes.push({ label: "PAN", before: show(decryptField(match.pan)), after: item.client.pan, sensitive: true });
      }
      const current = scopeByClient.get(match.id) ?? new Set();
      const added = item.client.scope_service_ids.filter((id) => !current.has(id));
      if (added.length) changes.push({ label: "Services added", before: null, after: `${added.length} service(s)` });
      const oldExtras = extrasById.get(match.id)?.fields ?? {};
      for (const [k, val] of Object.entries(item.client.extras.fields)) {
        if (differs(oldExtras[k], val)) changes.push({ label: k, before: oldExtras[k] ?? null, after: val });
      }
      item.existing_id = match.id;
      item.key = `client:${match.id}`;
      item.action = changes.length ? "update" : "unchanged";
      item.changes = changes;
    }
    items.push(item);
  };

  // Enriched rows first, so the hidden name list merges into them by legal name (§11.1).
  for (const r of enriched) consider(build(r, SHEET_CLIENTS, true));
  const enrichedKeys = new Set(items.filter((i) => i.client).map((i) => nameKey(i.client!.columns.name)));
  for (const r of names) {
    const raw = text(r.values["Name of the Company"]);
    if (raw && enrichedKeys.has(nameKey(tidyName(raw)))) {
      enrichedKeys.delete(nameKey(tidyName(raw))); // first hidden match is the same client
      continue;
    }
    consider(build(r, SHEET_CLIENT_NAMES, false));
  }

  for (const i of items) if (i.warnings && i.warnings.length === 0) delete i.warnings;
  return { items, matchedIds };
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                       */
/* ------------------------------------------------------------------ */

function headerRowFor(ws: ExcelJS.Worksheet, expected: string, maxRow = 10): number | null {
  for (let r = 1; r <= Math.min(maxRow, ws.rowCount); r++) {
    let found = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value as unknown;
      const value = raw && typeof raw === "object" && "result" in (raw as object)
        ? (raw as { result: unknown }).result
        : raw;
      if (normaliseHeader(value) === expected) found = true;
    });
    if (found) return r;
  }
  return null;
}

export async function buildImportPlan(wb: ExcelJS.Workbook): Promise<ImportPlan> {
  const sheetErrors: string[] = [];
  const newColumns = new Set<string>();

  const empSheet = findSheet(wb, SHEET_EMPLOYEES);
  const cliSheet = findSheet(wb, SHEET_CLIENTS);
  const namesSheet = findSheet(wb, SHEET_CLIENT_NAMES);
  if (!empSheet) sheetErrors.push(`Sheet "${SHEET_EMPLOYEES}" not found`);
  if (!cliSheet) sheetErrors.push(`Sheet "${SHEET_CLIENTS}" not found`);
  if (!namesSheet) sheetErrors.push(`Hidden sheet "${SHEET_CLIENT_NAMES}" not found`);

  const empHeader = empSheet ? headerRowFor(empSheet, E.id) : null;
  const cliHeader = cliSheet ? headerRowFor(cliSheet, C.name) : null;
  const namesHeader = namesSheet ? headerRowFor(namesSheet, "Name of the Company") : null;
  if (empSheet && !empHeader) sheetErrors.push(`"${SHEET_EMPLOYEES}": couldn't find the "${E.id}" column`);
  if (cliSheet && !cliHeader) sheetErrors.push(`"${SHEET_CLIENTS}": couldn't find the "${C.name}" column`);
  if (namesSheet && !namesHeader) sheetErrors.push(`"${SHEET_CLIENT_NAMES}": couldn't find the "Name of the Company" column`);

  const empTable = empSheet && empHeader ? readTable(empSheet, empHeader) : null;
  const cliTable = cliSheet && cliHeader ? readTable(cliSheet, cliHeader) : null;
  const namesTable = namesSheet && namesHeader ? readTable(namesSheet, namesHeader) : null;
  for (const h of empTable?.headers ?? []) if (!EMPLOYEE_KNOWN.has(h)) newColumns.add(`${SHEET_EMPLOYEES}: ${h}`);
  for (const h of cliTable?.headers ?? []) if (!CLIENT_KNOWN.has(h)) newColumns.add(`${SHEET_CLIENTS}: ${h}`);

  const lookups = await loadLookups();
  const unmatchedServices = new Map<string, number>();
  const unmatchedTypes = new Map<string, number>();

  const emp = empTable ? await planEmployees(empTable.rows, lookups) : { items: [], matchedIds: new Set<string>() };
  const cli = cliTable || namesTable
    ? await planClients(cliTable?.rows ?? [], namesTable?.rows ?? [], lookups, unmatchedServices, unmatchedTypes)
    : { items: [], matchedIds: new Set<string>() };

  // Gap #42: in the app but not in this file — reported only.
  const missing: ImportPlan["missing"] = [];
  if (empTable) {
    const all = await query<{ id: string; first_name: string; last_name: string | null; employee_id_code: string }>(
      `SELECT id, first_name, last_name, employee_id_code FROM employees ORDER BY employee_id_code`,
    );
    for (const e of all) {
      if (!emp.matchedIds.has(e.id)) {
        missing.push({ kind: "employee", id: e.id, name: [e.first_name, e.last_name].filter(Boolean).join(" "), code: e.employee_id_code });
      }
    }
  }
  if (cliTable || namesTable) {
    const all = await query<{ id: string; name: string; client_code: string }>(
      `SELECT id, name, client_code FROM clients WHERE is_active = true ORDER BY name`,
    );
    for (const c of all) if (!cli.matchedIds.has(c.id)) missing.push({ kind: "client", id: c.id, name: c.name, code: c.client_code });
  }

  const toList = (m: Map<string, number>) =>
    [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  return {
    employees: emp.items,
    clients: cli.items,
    missing,
    unmatched_services: toList(unmatchedServices),
    unmatched_entity_types: toList(unmatchedTypes),
    sheet_errors: sheetErrors,
    new_columns: [...newColumns],
  };
}

/** Plan as sent to the browser: no raw payloads, sensitive values masked. */
export function publicPlan(plan: ImportPlan) {
  const mask = (v: string | null) => (v === null ? null : v.length <= 4 ? "••••" : `${"•".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`);
  const strip = (i: PlanItem) => ({
    key: i.key,
    kind: i.kind,
    sheet: i.sheet,
    row: i.row,
    name: i.name,
    action: i.action,
    existing_id: i.existing_id ?? null,
    errors: i.errors ?? [],
    warnings: i.warnings ?? [],
    changes: (i.changes ?? []).map((c) =>
      c.sensitive ? { label: c.label, before: mask(c.before), after: mask(c.after) } : { label: c.label, before: c.before, after: c.after },
    ),
  });
  const count = (items: PlanItem[], a: PlanAction) => items.filter((i) => i.action === a).length;
  return {
    summary: {
      employees: {
        create: count(plan.employees, "create"),
        update: count(plan.employees, "update"),
        unchanged: count(plan.employees, "unchanged"),
        error: count(plan.employees, "error"),
      },
      clients: {
        create: count(plan.clients, "create"),
        update: count(plan.clients, "update"),
        unchanged: count(plan.clients, "unchanged"),
        review: count(plan.clients, "review"),
        error: count(plan.clients, "error"),
        profile_incomplete: plan.clients.filter((i) => i.action === "create" && i.client?.extras.profile_incomplete).length,
      },
      missing: plan.missing.length,
    },
    employees: plan.employees.map(strip),
    clients: plan.clients.map(strip),
    missing: plan.missing,
    unmatched_services: plan.unmatched_services,
    unmatched_entity_types: plan.unmatched_entity_types,
    sheet_errors: plan.sheet_errors,
    new_columns: plan.new_columns,
  };
}
