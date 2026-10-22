/**
 * Master data seed for CMA Practice Manager (requirements v1.1).
 *
 * Seeds, once per database:
 *  - the 3 firm entities (§1.1 / DM-01) — bank account numbers are entered in-app;
 *  - the entity-type master (DM-02a, 14 values);
 *  - the delay reason master DR-01..DR-08 with default payroll impact (Appendix D);
 *  - the 66 service types (Appendix A) and the OEM sub-catalogue (Appendix B);
 *  - the recurring statutory calendar rules (DM-11);
 *  - default payroll readiness thresholds per entity (FR-14).
 *
 * Rules: rows are only ever inserted, never overwritten — anything a user already
 * entered (matched by code or by name) is left alone. The one exception is
 * CMA LLP's can_attest flag, which the attest-billing rule (§1.1, A1) depends on.
 * A marker row in reference_data records completion so rows a user later deletes
 * are not recreated on the next restart.
 */
import { pool, isMockMode } from "@/lib/db";
import type { PoolClient } from "pg";

const MASTER_SEED_VERSION = "1";

type Recurrence = "monthly" | "quarterly" | "half_yearly" | "annually" | null;

interface EntitySeed {
  short_code: string;
  name: string;
  pan: string | null;
  gstin: string | null;
  can_attest: boolean;
  metadata: Record<string, unknown>;
}

const ENTITIES: EntitySeed[] = [
  {
    short_code: "CMA",
    name: "Chandramouli & Associates LLP",
    pan: "AARFC1446R",
    gstin: "33AARFC1446R1ZX",
    can_attest: true,
    metadata: {
      display_code: "CMA LLP",
      constitution: "LLP (CA firm)",
      tan: "CHEC17175E",
      llpin: "AAZ-8382",
      frn: "014844S/S000068",
      peer_review_cert_no: "018616",
      peer_review_valid_till: "2027-10-31",
      udyam_no: "UDYAM-TN-02-0180898",
      email: "chandramouliandassociates@gmail.com",
      city: "Chennai",
      partners: ["Chandramouli", "KJ Venkatesh", "Mukundan", "Vanisri"],
      banks: ["IDFC First Bank (Teynampet)", "Dhanlaxmi Bank (T Nagar)"],
    },
  },
  {
    short_code: "SGC",
    name: "Shri Gurupadhuka Consultants",
    pan: "AFOPC4319K",
    gstin: null,
    can_attest: false,
    metadata: {
      display_code: "SGC",
      constitution: "Proprietorship",
      udyam_no: "UDYAM-TN-02-0435296",
      email: "gurupadhuka1978@gmail.com",
      city: "Chennai",
      partners: ["Nirmala Chandramouli"],
      banks: ["South Indian Bank (T Nagar)"],
    },
  },
  {
    short_code: "GMC",
    name: "Grow More Corporate Services",
    pan: "CDZPC3422Q",
    gstin: "33CDZPC3422Q1Z2",
    can_attest: false,
    metadata: {
      display_code: "GMC",
      constitution: "Proprietorship",
      udyam_no: "UDYAM-TN-02-0235234",
      email: "Growmorecorporateservices@gmail.com",
      city: "Chennai",
      partners: ["Srinidhi Chandrasekar"],
      banks: ["Axis Bank (T Nagar)"],
    },
  },
];

/** DM-02a canonical entity types, with the source-data variants that map to each. */
const ENTITY_TYPES: { code: string; label: string; aliases: string[] }[] = [
  { code: "private_limited", label: "Private Limited", aliases: ["Pvt Co", "Private limited Co", "Pvt Ltd"] },
  { code: "public_limited", label: "Public Limited", aliases: ["Public Ltd", "Public Ltd Co"] },
  { code: "opc", label: "OPC", aliases: ["One Person Company"] },
  { code: "llp", label: "LLP", aliases: [] },
  { code: "partnership_firm", label: "Partnership Firm", aliases: ["Partnership"] },
  { code: "proprietor", label: "Proprietor", aliases: ["Proprietorship"] },
  { code: "trust", label: "Trust", aliases: [] },
  { code: "society", label: "Society", aliases: [] },
  { code: "huf", label: "HUF", aliases: [] },
  { code: "individual", label: "Individual", aliases: [] },
  { code: "public_sector_bank", label: "Public Sector Bank", aliases: ["PSB", "PSU BANK"] },
  { code: "private_bank", label: "Private Bank", aliases: [] },
  { code: "foreign_subsidiary", label: "Subsidiary of Foreign Company", aliases: [] },
  { code: "other", label: "Other", aliases: [] },
];

/** Appendix D. `side` drives FR-13: client-side reasons are payroll-neutral, staff-side blocking. */
const DELAY_REASONS: {
  code: string;
  label: string;
  default_payroll_impact: "neutral" | "blocking" | "blocking_until_approved" | "partner_decides";
  side: "client" | "staff" | "third_party" | "neutral";
  requires_free_text?: boolean;
}[] = [
  { code: "DR-01", label: "Client data pending", default_payroll_impact: "neutral", side: "client" },
  { code: "DR-02", label: "No update logged by staff", default_payroll_impact: "blocking", side: "staff" },
  { code: "DR-03", label: "Staff on leave", default_payroll_impact: "neutral", side: "staff" },
  { code: "DR-04", label: "Awaiting third-party input (banker/valuer/consultant)", default_payroll_impact: "neutral", side: "third_party" },
  { code: "DR-05", label: "Client DSC / signature pending", default_payroll_impact: "neutral", side: "client" },
  { code: "DR-06", label: "Reassigned — pending handover", default_payroll_impact: "blocking_until_approved", side: "staff" },
  { code: "DR-07", label: "Statutory portal unavailable", default_payroll_impact: "neutral", side: "neutral" },
  { code: "DR-08", label: "Other (mandatory free text)", default_payroll_impact: "partner_decides", side: "neutral", requires_free_text: true },
];

interface ServiceSeed {
  name: string;
  attest?: boolean;
  recurrence?: Recurrence;
}

/** Appendix A — 66 unique services ("Tax Audit" appears twice in the source and is kept once). */
const SERVICE_CATEGORIES: { prefix: string; category: string; services: ServiceSeed[] }[] = [
  {
    prefix: "AUD",
    category: "Audit & Assurance",
    services: [
      { name: "Statutory audit Co", attest: true, recurrence: "annually" },
      { name: "Tax Audit", attest: true, recurrence: "annually" },
      { name: "Transaction cost Audit" },
      { name: "SBA", attest: true, recurrence: "annually" },
      { name: "Concurrent Audit", recurrence: "monthly" },
      { name: "Internal audit Co" },
      { name: "OEM Operational audit" },
      { name: "Stock Audit" },
      { name: "Verification of Gold Loan" },
      { name: "Non Statutory Audit Others" },
      { name: "Voluntary Audit" },
    ],
  },
  {
    prefix: "ACC",
    category: "Accounting & MIS",
    services: [
      { name: "MIS", recurrence: "monthly" },
      { name: "Tally Accounting", recurrence: "monthly" },
      { name: "Back office", recurrence: "monthly" },
      { name: "Accounting", recurrence: "monthly" },
      { name: "Retainer", recurrence: "monthly" },
      { name: "Deputation Charges" },
    ],
  },
  {
    prefix: "DT",
    category: "Direct Tax",
    services: [
      { name: "IT filing", recurrence: "annually" },
      { name: "ITR Filing", recurrence: "annually" },
      { name: "TDS Monthly calculation", recurrence: "monthly" },
      { name: "TDS Qtr return", recurrence: "quarterly" },
      { name: "Capital Gains calculation" },
      { name: "Income tax Refund" },
      { name: "Transfer pricing Filing", recurrence: "annually" },
      { name: "Valuation Report IT" },
      { name: "11UA Valuation" },
    ],
  },
  {
    prefix: "IDT",
    category: "Indirect Tax",
    services: [
      { name: "GST Calculation", recurrence: "monthly" },
      { name: "GST filing", recurrence: "monthly" },
      { name: "GST Refund" },
    ],
  },
  {
    prefix: "ROC",
    category: "Corporate & ROC",
    services: [
      { name: "CO formation" },
      { name: "ROC" },
      { name: "ROC Filing", recurrence: "annually" },
      { name: "LLP Filing", recurrence: "annually" },
      { name: "LLP Formation" },
      { name: "Partnership deed" },
      { name: "Partnership Formation" },
      { name: "Company Formation Discussion" },
      { name: "Form 8 Signing", recurrence: "annually" },
      { name: "List of Shareholders" },
      { name: "List of Directors" },
      { name: "Valuation Report ROC" },
      { name: "Valuation of shares" },
      { name: "ROC certificates" },
    ],
  },
  {
    prefix: "CERT",
    category: "Certification",
    services: [
      { name: "Networth Certificate", attest: true },
      { name: "Customs Certificate", attest: true },
      { name: "Sec 285 certificate", attest: true },
      { name: "15 CA/CB", attest: true },
      { name: "Turnover Certificate", attest: true },
      { name: "Book Stock certificate", attest: true },
      { name: "Due Diligence certificate", attest: true },
      { name: "No Due certificate Statutory", attest: true },
      { name: "End use certificate", attest: true },
      { name: "Trade mark certificate", attest: true },
      { name: "Certification", attest: true },
    ],
  },
  {
    prefix: "FEMA",
    category: "FEMA / International",
    services: [
      { name: "APR filing", recurrence: "annually" },
      { name: "FEMA FLA Returns", recurrence: "annually" },
    ],
  },
  {
    prefix: "REG",
    category: "Registrations & Advisory",
    services: [
      { name: "PAN Application" },
      { name: "PAN Application NRI" },
      { name: "DSC" },
      { name: "Consulting" },
      { name: "Compliance fees" },
    ],
  },
  {
    prefix: "RMB",
    category: "Reimbursements",
    services: [
      { name: "Reimbursement ROC" },
      { name: "Reimbursement GST fees" },
      { name: "Reimbursement Others" },
      { name: "Reimbursement travel" },
      { name: "Reimbursement Food" },
    ],
  },
];

/**
 * Appendix B — OEM operational audit sub-catalogue, parented to "OEM Operational audit".
 * The document states 32 entries but lists 31; the missing one is added in-app.
 */
const OEM_SUB_SERVICES = [
  "Stock Audit Report", "Job card Vouching", "Warranty & FSC Verification", "Warranty Finalization",
  "Discount Verification", "Paint Verification", "AMC, RSA & EW", "Credit Bills",
  "Collection Verification", "Cash Deposit verification (Daily)", "Physical Cash verification",
  "Spares Purchase Verification", "AD Sales", "Spares Payment Verification",
  "Job Card Queries Clarification", "Sales Folder Verification", "Sales Collection Verification",
  "Sales Discount Verification", "Sales Claim/R-max", "Master Data preparation",
  "Master Data verification", "Sales Queries Clarification", "Insurance Payment",
  "Insurance Commission", "Finance Commission", "Status Report on a Weekly basis",
  "Daily Work done Update", "Preparation of Outstanding Report", "Internal Audit Report",
  "Report Verification", "BRS",
];

const COMPANY_TYPES = ["private_limited", "public_limited", "opc"];

/**
 * DM-11 recurring rules. `due_day_of_month` is what the current generator reads;
 * `due_date_logic.schedule` holds the full statutory calendar (month/day pairs)
 * for the due-date engine to use.
 */
const STATUTORY_RULES: {
  name: string;
  statute: string;
  form_or_return: string;
  frequency: "monthly" | "quarterly" | "half_yearly" | "annually" | "event_driven";
  due_day_of_month: number | null;
  schedule: { month?: number; day: number; note?: string }[];
  service: string | null;
  entity_types: string[] | null;
}[] = [
  { name: "GSTR-1", statute: "CGST Act 2017", form_or_return: "GSTR-1", frequency: "monthly", due_day_of_month: 11, schedule: [{ day: 11, note: "11th of following month" }], service: "GST filing", entity_types: null },
  { name: "GSTR-3B", statute: "CGST Act 2017", form_or_return: "GSTR-3B", frequency: "monthly", due_day_of_month: 20, schedule: [{ day: 20, note: "20th of following month" }], service: "GST filing", entity_types: null },
  { name: "GST Annual Return", statute: "CGST Act 2017", form_or_return: "GSTR-9 / GSTR-9C", frequency: "annually", due_day_of_month: 31, schedule: [{ month: 12, day: 31 }], service: "GST filing", entity_types: null },
  { name: "TDS / TCS Payment", statute: "Income-tax Act 1961", form_or_return: "Challan 281", frequency: "monthly", due_day_of_month: 7, schedule: [{ day: 7, note: "7th of following month; March deductions due 30 April" }], service: "TDS Monthly calculation", entity_types: null },
  { name: "TDS Quarterly Returns", statute: "Income-tax Act 1961", form_or_return: "24Q / 26Q / 27Q", frequency: "quarterly", due_day_of_month: 31, schedule: [{ month: 7, day: 31 }, { month: 10, day: 31 }, { month: 1, day: 31 }, { month: 5, day: 31 }], service: "TDS Qtr return", entity_types: null },
  { name: "Advance Tax", statute: "Income-tax Act 1961", form_or_return: "Challan 280", frequency: "quarterly", due_day_of_month: 15, schedule: [{ month: 6, day: 15 }, { month: 9, day: 15 }, { month: 12, day: 15 }, { month: 3, day: 15 }], service: "IT filing", entity_types: null },
  { name: "Income Tax Return", statute: "Income-tax Act 1961", form_or_return: "ITR", frequency: "annually", due_day_of_month: 31, schedule: [{ month: 7, day: 31, note: "non-audit cases" }, { month: 10, day: 31, note: "audit cases" }], service: "ITR Filing", entity_types: null },
  { name: "Tax Audit Report", statute: "Income-tax Act 1961", form_or_return: "Form 3CA / 3CB-3CD", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 9, day: 30 }], service: "Tax Audit", entity_types: null },
  { name: "Financial Statements Filing", statute: "Companies Act 2013", form_or_return: "AOC-4", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 10, day: 30, note: "30 days from AGM" }], service: "ROC Filing", entity_types: COMPANY_TYPES },
  { name: "Annual Return", statute: "Companies Act 2013", form_or_return: "MGT-7 / MGT-7A", frequency: "annually", due_day_of_month: 29, schedule: [{ month: 11, day: 29, note: "60 days from AGM" }], service: "ROC Filing", entity_types: COMPANY_TYPES },
  { name: "Auditor Appointment", statute: "Companies Act 2013", form_or_return: "ADT-1", frequency: "annually", due_day_of_month: 14, schedule: [{ month: 10, day: 14, note: "15 days from AGM" }], service: "ROC Filing", entity_types: COMPANY_TYPES },
  { name: "Director KYC", statute: "Companies Act 2013", form_or_return: "DIR-3 KYC", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 9, day: 30 }], service: "ROC Filing", entity_types: [...COMPANY_TYPES, "llp"] },
  { name: "Return of Deposits", statute: "Companies Act 2013", form_or_return: "DPT-3", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 6, day: 30 }], service: "ROC Filing", entity_types: COMPANY_TYPES },
  { name: "MSME Outstanding Return", statute: "Companies Act 2013", form_or_return: "MSME-1", frequency: "half_yearly", due_day_of_month: 30, schedule: [{ month: 4, day: 30 }, { month: 10, day: 31 }], service: "ROC Filing", entity_types: COMPANY_TYPES },
  { name: "LLP Statement of Account & Solvency", statute: "LLP Act 2008", form_or_return: "LLP Form 8", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 10, day: 30 }], service: "LLP Filing", entity_types: ["llp"] },
  { name: "LLP Annual Return", statute: "LLP Act 2008", form_or_return: "LLP Form 11", frequency: "annually", due_day_of_month: 30, schedule: [{ month: 5, day: 30 }], service: "LLP Filing", entity_types: ["llp"] },
  { name: "Foreign Liabilities & Assets Return", statute: "FEMA 1999", form_or_return: "FLA Return", frequency: "annually", due_day_of_month: 15, schedule: [{ month: 7, day: 15 }], service: "FEMA FLA Returns", entity_types: null },
  { name: "Annual Performance Report", statute: "FEMA 1999", form_or_return: "APR", frequency: "annually", due_day_of_month: 31, schedule: [{ month: 12, day: 31 }], service: "APR filing", entity_types: null },
  { name: "Foreign Remittance Certificate", statute: "Income-tax Act 1961", form_or_return: "Form 15CA / 15CB", frequency: "event_driven", due_day_of_month: null, schedule: [{ day: 0, note: "before each foreign remittance" }], service: "15 CA/CB", entity_types: null },
  { name: "Concurrent Audit Monthly Report", statute: "Bank engagement terms", form_or_return: "Concurrent audit report", frequency: "monthly", due_day_of_month: 10, schedule: [{ day: 10, note: "as per bank engagement terms; confirm per bank" }], service: "Concurrent Audit", entity_types: ["public_sector_bank", "private_bank"] },
];

/** FR-14 defaults — the Managing Partner can change these per entity (open question Q2). */
const DEFAULT_THRESHOLDS = {
  min_task_completion_pct: 0.5,
  config: {
    review_needed_max_blocking_items: 2,
    on_hold_min_blocking_items: 3,
    on_hold_below_completion_pct: 0.5,
    source: "FR-14 default",
  },
};

async function seedEntities(client: PoolClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const e of ENTITIES) {
    const existing = await client.query<{ id: string; pan: string | null; gstin: string | null; metadata: Record<string, unknown> | null }>(
      `SELECT id, pan, gstin, metadata FROM entities
        WHERE short_code = $1 OR lower(name) = lower($2)
        ORDER BY (short_code = $1) DESC
        LIMIT 1`,
      [e.short_code, e.name],
    );
    if (existing.rows.length === 0) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO entities (name, short_code, pan, gstin, can_attest, is_active, metadata)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         RETURNING id`,
        [e.name, e.short_code, e.pan, e.gstin, e.can_attest, JSON.stringify(e.metadata)],
      );
      ids.set(e.short_code, inserted.rows[0].id);
      continue;
    }
    const row = existing.rows[0];
    // Fill blanks only; keys the user already set win over the seed.
    const mergedMetadata = { ...e.metadata, ...(row.metadata ?? {}) };
    await client.query(
      `UPDATE entities
          SET pan = COALESCE(pan, $2),
              gstin = COALESCE(gstin, $3),
              metadata = $4,
              can_attest = CASE WHEN $5 THEN true ELSE can_attest END,
              updated_at = now()
        WHERE id = $1`,
      [row.id, e.pan, e.gstin, JSON.stringify(mergedMetadata), e.can_attest],
    );
    ids.set(e.short_code, row.id);
  }
  return ids;
}

async function seedReferenceData(client: PoolClient): Promise<void> {
  const rows: { type: string; code: string; label: string; sort: number; metadata: Record<string, unknown> }[] = [
    ...ENTITY_TYPES.map((t, i) => ({
      type: "entity_type",
      code: t.code,
      label: t.label,
      sort: i + 1,
      metadata: { import_aliases: t.aliases },
    })),
    ...DELAY_REASONS.map((r, i) => ({
      type: "delay_reason",
      code: r.code,
      label: r.label,
      sort: i + 1,
      metadata: {
        default_payroll_impact: r.default_payroll_impact,
        side: r.side,
        requires_free_text: r.requires_free_text === true,
      },
    })),
  ];
  for (const r of rows) {
    const existing = await client.query(
      `SELECT id FROM reference_data
        WHERE type = $1 AND (code = $2 OR lower(label) = lower($3))
        LIMIT 1`,
      [r.type, r.code, r.label],
    );
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ($1, $2, $3, $4, true, $5)
       ON CONFLICT (type, code) DO NOTHING`,
      [r.type, r.code, r.label, r.sort, JSON.stringify(r.metadata)],
    );
  }
}

async function upsertService(
  client: PoolClient,
  code: string,
  name: string,
  category: string,
  opts: { attest: boolean; recurrence: Recurrence; billingEntityId: string | null; parentId: string | null },
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM service_types WHERE code = $1 OR lower(name) = lower($2) LIMIT 1`,
    [code, name],
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO service_types
       (code, name, description, parent_service_id, is_attest, is_recurring,
        recurrence_pattern, default_billing_entity_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     RETURNING id`,
    [
      code,
      name,
      `Category: ${category}`,
      opts.parentId,
      opts.attest,
      opts.recurrence !== null,
      opts.recurrence,
      opts.billingEntityId,
    ],
  );
  return inserted.rows[0].id;
}

async function seedServiceTypes(client: PoolClient, entityIds: Map<string, string>): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const cmaId = entityIds.get("CMA") ?? null;
  for (const group of SERVICE_CATEGORIES) {
    for (const [i, s] of group.services.entries()) {
      const code = `${group.prefix}-${String(i + 1).padStart(2, "0")}`;
      const attest = s.attest === true;
      const id = await upsertService(client, code, s.name, group.category, {
        attest,
        recurrence: s.recurrence ?? null,
        // Attest work must be billed from CMA LLP (§1.1); others are chosen per engagement.
        billingEntityId: attest ? cmaId : null,
        parentId: null,
      });
      byName.set(s.name.toLowerCase(), id);
    }
  }
  const oemParent = byName.get("oem operational audit") ?? null;
  for (const [i, name] of OEM_SUB_SERVICES.entries()) {
    await upsertService(client, `OEM-${String(i + 1).padStart(2, "0")}`, name, "OEM Operational Audit", {
      attest: false,
      recurrence: null,
      billingEntityId: null,
      parentId: oemParent,
    });
  }
  return byName;
}

async function seedStatutoryRules(client: PoolClient, services: Map<string, string>): Promise<void> {
  for (const r of STATUTORY_RULES) {
    const existing = await client.query(
      `SELECT id FROM statutory_calendar_rules
        WHERE lower(name) = lower($1) OR lower(form_or_return) = lower($2)
        LIMIT 1`,
      [r.name, r.form_or_return],
    );
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO statutory_calendar_rules
         (name, statute, form_or_return, applicable_entity_types, applicable_service_type_id,
          frequency, due_day_of_month, due_date_logic, escalation_rules, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [
        r.name,
        r.statute,
        r.form_or_return,
        r.entity_types ? JSON.stringify(r.entity_types) : null,
        r.service ? services.get(r.service.toLowerCase()) ?? null : null,
        r.frequency,
        r.due_day_of_month,
        JSON.stringify({ schedule: r.schedule }),
        // FR-67 ladder; the day offsets are defaults the firm can tune.
        JSON.stringify({
          ladder: [
            { level: 1, notify: "assignee", days_before_due: 7 },
            { level: 2, notify: "engagement_manager", days_before_due: 3 },
            { level: 3, notify: "partner_in_charge", days_before_due: 1 },
            { level: 4, notify: "managing_partner", days_after_due: 0 },
          ],
        }),
      ],
    );
  }
}

async function seedThresholds(client: PoolClient, entityIds: Map<string, string>): Promise<void> {
  for (const entityId of entityIds.values()) {
    const existing = await client.query(
      `SELECT id FROM payroll_readiness_thresholds WHERE entity_id = $1 LIMIT 1`,
      [entityId],
    );
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO payroll_readiness_thresholds
         (entity_id, min_task_completion_pct, allow_partial_release, config)
       VALUES ($1, $2, false, $3)`,
      [entityId, DEFAULT_THRESHOLDS.min_task_completion_pct, JSON.stringify(DEFAULT_THRESHOLDS.config)],
    );
  }
}

async function runMasterSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cma_pms_master_seed'))`);

    const marker = await client.query<{ label: string }>(
      `SELECT label FROM reference_data
        WHERE type = 'system_setting' AND code = 'master_seed_version'
        LIMIT 1`,
    );
    if (marker.rows.length > 0 && marker.rows[0].label >= MASTER_SEED_VERSION) {
      await client.query("COMMIT");
      return;
    }

    const entityIds = await seedEntities(client);
    await seedReferenceData(client);
    const services = await seedServiceTypes(client, entityIds);
    await seedStatutoryRules(client, services);
    await seedThresholds(client, entityIds);

    await client.query(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ('system_setting', 'master_seed_version', $1, 0, false, $2)
       ON CONFLICT (type, code)
       DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, updated_at = now()`,
      [MASTER_SEED_VERSION, JSON.stringify({ seeded_at: new Date().toISOString() })],
    );

    await client.query("COMMIT");
    console.log("[master-seed] master data seeded (version %s)", MASTER_SEED_VERSION);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let masterSeeded: Promise<void> | null = null;

/** Run the master seed once per server process; retried on the next call if it fails. */
export async function ensureMasterDataSeeded(): Promise<void> {
  if (isMockMode) return;
  if (!masterSeeded) {
    masterSeeded = runMasterSeed().catch((err) => {
      masterSeeded = null;
      console.error("[master-seed] failed:", err);
    });
  }
  await masterSeeded;
}
