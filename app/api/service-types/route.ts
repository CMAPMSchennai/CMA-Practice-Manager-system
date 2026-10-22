/**
 * GET  /api/service-types — list service types (requires auth)
 * POST /api/service-types — create service type (requires manage_settings or admin)
 *
 * US012 acceptance criteria:
 * - AC-1: GET returns ≥ 98 service types (66 + 32 OEM sub-items)
 * - AC-2: POST as paid_assistant → 403
 * - AC-3: POST without code → 422
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName, userHasPermission } from "@/lib/rbac";
import { getVisibilitySettings } from "@/lib/visibility-settings";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";

/**
 * The firm's first rate sheet (rate.xlsx, "Billing master", received 15 Oct 2026): 21 services
 * with a rate, in rupees before GST (confirmed 16 Oct 2026). Loaded once. After that the
 * Managing Partner or Admin owns the prices and edits them on the catalogue page; this never
 * overwrites a price that has been set.
 */
const FIRM_RATES_V1: [string, number][] = [
  ["15 CA/CB", 3500],
  ["Networth Certificate", 3500],
  ["ROC certificates", 2000],
  ["Customs Certificate", 3500],
  ["APR filing", 5000],
  ["FEMA FLA Returns", 5000],
  ["11UA Valuation", 50000],
  ["PAN Application", 1000],
  ["PAN Application NRI", 2000],
  ["Partnership deed", 5000],
  ["DSC", 1000],
  ["ITR Filing", 3000],
  ["LLP Filing", 2000],
  ["ROC Filing", 2000],
  ["Certification", 3500],
  ["Turnover Certificate", 3500],
  ["Book Stock certificate", 3500],
  ["No Due certificate Statutory", 3500],
  ["End use certificate", 3500],
  ["List of Shareholders", 2000],
  ["List of Directors", 2000],
];

async function seedStandardFees() {
  const key = "standard_fees_from_firm_sheet_v1";
  const done = await query<{ id: string }>(
    `SELECT id FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [key],
  );
  if (done.length > 0) return;
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, $2, 0, true, NULL)`,
    [key, "Standard fees loaded from the firm's rate sheet (16 Oct 2026)"],
  );
  for (const [name, fee] of FIRM_RATES_V1) {
    await query(
      `UPDATE service_types SET standard_fee = $2, updated_at = now()
        WHERE lower(trim(name)) = lower($1) AND standard_fee IS NULL`,
      [name, fee],
    );
  }
  // The firm gave a rate for the Turnover Certificate, which was switched off.
  await query(
    `UPDATE service_types SET is_active = true, updated_at = now()
      WHERE code = 'ST-OTH-002' AND name = 'Turnover Certificate'`,
  );
}

/** Ensure the 66 CMA services + 32 OEM sub-items are seeded */
async function seedServiceTypes() {
  const countRows = await query<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM service_types`,
    [],
  );
  const existing = parseInt(countRows[0]?.cnt ?? "0", 10);
  if (existing >= 98) return; // already seeded

  // 66 top-level CMA services
  const cmaServices = [
    // Audit & Assurance (10)
    { code: "ST-AA-001", name: "Statutory Audit", is_attest: true },
    { code: "ST-AA-002", name: "Tax Audit (u/s 44AB)", is_attest: true },
    { code: "ST-AA-003", name: "Transfer Pricing Audit", is_attest: true },
    { code: "ST-AA-004", name: "Internal Audit", is_attest: false },
    { code: "ST-AA-005", name: "Stock Audit", is_attest: false },
    { code: "ST-AA-006", name: "Bank Audit (Concurrent)", is_attest: true },
    { code: "ST-AA-007", name: "Revenue Audit", is_attest: true },
    { code: "ST-AA-008", name: "Special Purpose Audit", is_attest: true },
    { code: "ST-AA-009", name: "Limited Review", is_attest: true },
    { code: "ST-AA-010", name: "Agreed-Upon Procedures", is_attest: true },
    // Taxation — Direct (10)
    { code: "ST-TD-001", name: "Income Tax Return Filing — Individual", is_attest: false },
    { code: "ST-TD-002", name: "Income Tax Return Filing — HUF", is_attest: false },
    { code: "ST-TD-003", name: "Income Tax Return Filing — Company", is_attest: false },
    { code: "ST-TD-004", name: "Income Tax Return Filing — LLP/Partnership", is_attest: false },
    { code: "ST-TD-005", name: "TDS/TCS Return Filing", is_attest: false },
    { code: "ST-TD-006", name: "Advance Tax Computation", is_attest: false },
    { code: "ST-TD-007", name: "Tax Litigation — Assessment", is_attest: false },
    { code: "ST-TD-008", name: "Tax Litigation — Appeal", is_attest: false },
    { code: "ST-TD-009", name: "Transfer Pricing Study", is_attest: false },
    { code: "ST-TD-010", name: "Lower/Nil TDS Certificate", is_attest: false },
    // Taxation — Indirect (8)
    { code: "ST-TI-001", name: "GST Registration", is_attest: false },
    { code: "ST-TI-002", name: "GSTR-1 Filing", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    { code: "ST-TI-003", name: "GSTR-3B Filing", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    { code: "ST-TI-004", name: "GSTR-9 Annual Return", is_attest: false, is_recurring: true, recurrence_pattern: "annually" },
    { code: "ST-TI-005", name: "GST Audit (GSTR-9C)", is_attest: true, is_recurring: true, recurrence_pattern: "annually" },
    { code: "ST-TI-006", name: "GST Refund Processing", is_attest: false },
    { code: "ST-TI-007", name: "GST Litigation", is_attest: false },
    { code: "ST-TI-008", name: "Customs / Import-Export Compliance", is_attest: false },
    // ROC / Secretarial (8)
    { code: "ST-ROC-001", name: "Company Incorporation", is_attest: false },
    { code: "ST-ROC-002", name: "LLP Incorporation", is_attest: false },
    { code: "ST-ROC-003", name: "Annual ROC Filings (AOC-4, MGT-7)", is_attest: false, is_recurring: true, recurrence_pattern: "annually" },
    { code: "ST-ROC-004", name: "Director KYC (DIR-3 KYC)", is_attest: false, is_recurring: true, recurrence_pattern: "annually" },
    { code: "ST-ROC-005", name: "Charge Creation/Modification (CHG-1)", is_attest: false },
    { code: "ST-ROC-006", name: "Share Transfer & Transmission", is_attest: false },
    { code: "ST-ROC-007", name: "Change of Name/Address/MOA/AOA", is_attest: false },
    { code: "ST-ROC-008", name: "Winding Up / Strike Off", is_attest: false },
    // Accounting & Bookkeeping (6)
    { code: "ST-BK-001", name: "Monthly Bookkeeping", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    { code: "ST-BK-002", name: "Payroll Processing", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    { code: "ST-BK-003", name: "MIS Reports", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    { code: "ST-BK-004", name: "Accounts Finalization", is_attest: false, is_recurring: true, recurrence_pattern: "annually" },
    { code: "ST-BK-005", name: "Fixed Asset Register Maintenance", is_attest: false },
    { code: "ST-BK-006", name: "Bank Reconciliation", is_attest: false, is_recurring: true, recurrence_pattern: "monthly" },
    // FEMA / International (4)
    { code: "ST-FEMA-001", name: "FEMA Compliance Advisory", is_attest: false },
    { code: "ST-FEMA-002", name: "FDI Reporting (FC-GPR / FC-TRS)", is_attest: false },
    { code: "ST-FEMA-003", name: "ECB Reporting", is_attest: false },
    { code: "ST-FEMA-004", name: "RBI/SEBI Regulatory Filing", is_attest: false },
    // Valuation (4)
    { code: "ST-VAL-001", name: "Business Valuation", is_attest: false },
    { code: "ST-VAL-002", name: "Share Valuation", is_attest: false },
    { code: "ST-VAL-003", name: "Intangible Asset Valuation", is_attest: false },
    { code: "ST-VAL-004", name: "Fairness Opinion", is_attest: false },
    // Due Diligence (3)
    { code: "ST-DD-001", name: "Financial Due Diligence", is_attest: false },
    { code: "ST-DD-002", name: "Tax Due Diligence", is_attest: false },
    { code: "ST-DD-003", name: "Legal & Secretarial Due Diligence", is_attest: false },
    // Advisory (5)
    { code: "ST-ADV-001", name: "CFO Advisory Services", is_attest: false },
    { code: "ST-ADV-002", name: "Business Restructuring Advisory", is_attest: false },
    { code: "ST-ADV-003", name: "Financial Planning & Analysis", is_attest: false },
    { code: "ST-ADV-004", name: "Risk Management Advisory", is_attest: false },
    { code: "ST-ADV-005", name: "Internal Control Review", is_attest: false },
    // RERA / Real Estate (2)
    { code: "ST-RERA-001", name: "RERA Audit & Certification", is_attest: true },
    { code: "ST-RERA-002", name: "RERA Project Compliance", is_attest: false },
    // Insolvency (2)
    { code: "ST-IBC-001", name: "Insolvency Resolution Advisory", is_attest: false },
    { code: "ST-IBC-002", name: "Liquidation Support", is_attest: false },
    // Others (4)
    { code: "ST-OTH-001", name: "Net-Worth Certificate", is_attest: true },
    { code: "ST-OTH-002", name: "Turnover Certificate", is_attest: true },
    { code: "ST-OTH-003", name: "Compilation of Financial Statements", is_attest: false },
    { code: "ST-OTH-004", name: "Other Certification / Attestation", is_attest: true },
  ];

  // Insert top-level services
  for (const svc of cmaServices) {
    await query(
      `INSERT INTO service_types (code, name, description, is_attest, is_recurring, recurrence_pattern, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (code) DO NOTHING`,
      [
        svc.code,
        svc.name,
        null,
        (svc as { is_attest?: boolean }).is_attest ?? false,
        (svc as { is_recurring?: boolean }).is_recurring ?? false,
        (svc as { recurrence_pattern?: string }).recurrence_pattern ?? null,
      ],
    );
  }

  // 32 OEM sub-items under Statutory Audit (ST-AA-001)
  const parentRow = await query<{ id: string }>(
    `SELECT id FROM service_types WHERE code = 'ST-AA-001' LIMIT 1`,
    [],
  );
  if (parentRow.length > 0) {
    const parentId = parentRow[0].id;
    const oemSubItems = [
      { code: "ST-OEM-001", name: "Planning & Risk Assessment" },
      { code: "ST-OEM-002", name: "Engagement Acceptance & Continuance" },
      { code: "ST-OEM-003", name: "Understanding the Entity & Environment" },
      { code: "ST-OEM-004", name: "Internal Control Evaluation" },
      { code: "ST-OEM-005", name: "Materiality Determination" },
      { code: "ST-OEM-006", name: "Audit Program Preparation" },
      { code: "ST-OEM-007", name: "Revenue & Receivables Testing" },
      { code: "ST-OEM-008", name: "Purchases & Payables Testing" },
      { code: "ST-OEM-009", name: "Inventory Testing" },
      { code: "ST-OEM-010", name: "Fixed Assets Testing" },
      { code: "ST-OEM-011", name: "Cash & Bank Testing" },
      { code: "ST-OEM-012", name: "Loans & Borrowings Testing" },
      { code: "ST-OEM-013", name: "Capital & Reserves Testing" },
      { code: "ST-OEM-014", name: "Payroll & Employee Benefits Testing" },
      { code: "ST-OEM-015", name: "Tax Provisions Testing" },
      { code: "ST-OEM-016", name: "Related Party Transactions Review" },
      { code: "ST-OEM-017", name: "Contingencies & Commitments Review" },
      { code: "ST-OEM-018", name: "Subsequent Events Review" },
      { code: "ST-OEM-019", name: "Going Concern Assessment" },
      { code: "ST-OEM-020", name: "Analytical Procedures" },
      { code: "ST-OEM-021", name: "Sampling & Test of Details" },
      { code: "ST-OEM-022", name: "Representation Letter" },
      { code: "ST-OEM-023", name: "Draft Financial Statements Review" },
      { code: "ST-OEM-024", name: "Disclosure Checklist" },
      { code: "ST-OEM-025", name: "Schedules & Notes Verification" },
      { code: "ST-OEM-026", name: "Tax Audit Coordination" },
      { code: "ST-OEM-027", name: "Working Paper Review (Senior)" },
      { code: "ST-OEM-028", name: "Partner Review & Sign-off" },
      { code: "ST-OEM-029", name: "Engagement Quality Control Review" },
      { code: "ST-OEM-030", name: "Audit Report Drafting" },
      { code: "ST-OEM-031", name: "Management Letter / Report Drafting" },
      { code: "ST-OEM-032", name: "File Archival & Closure" },
    ];

    for (const oem of oemSubItems) {
      await query(
        `INSERT INTO service_types (code, name, parent_service_id, is_attest, is_active)
         VALUES ($1, $2, $3, true, true)
         ON CONFLICT (code) DO NOTHING`,
        [oem.code, oem.name, parentId],
      );
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // All authenticated users can view service types
    const sp = req.nextUrl.searchParams;
    const parentId = sp.get("parent_id");
    const isActive = sp.get("is_active");
    const isAttest = sp.get("is_attest");
    const search = sp.get("search");
    const topLevel = sp.get("top_level"); // only root services

    // Auto-seed if needed
    await seedServiceTypes();
    await seedStandardFees();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parentId) {
      conditions.push(`parent_service_id = $${idx++}`);
      values.push(parentId);
    } else if (topLevel === "true") {
      conditions.push(`parent_service_id IS NULL`);
    }

    if (isActive !== null && isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(isActive === "true");
    }

    if (isAttest !== null && isAttest !== undefined) {
      conditions.push(`is_attest = $${idx++}`);
      values.push(isAttest === "true");
    }

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR code ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query(
      `SELECT id, code, name, description, parent_service_id, is_attest,
              is_recurring, recurrence_pattern, standard_fee, sac_code,
              is_active, created_at, updated_at
         FROM service_types
         ${where}
         ORDER BY code ASC`,
      values,
    );

    // §4: Paid Assistants and Articled Clerks have no fee visibility, so the
    // standard fee is left out for roles without billing access.
    // Gap #31 (added feature): for a Manager the Managing Partner or Admin decides, in Settings.
    const roleName = await getUserRoleName(session.id);
    const feeVisible =
      roleName === "manager"
        ? (await getVisibilitySettings()).settings.managers_see_standard_fees
        : await userHasPermission(session.id, "view_billing");
    const visible = feeVisible
      ? rows
      : (rows as Record<string, unknown>[]).map((r) => ({ ...r, standard_fee: null }));

    const canEdit = await userHasPermission(session.id, "manage_settings");
    return NextResponse.json({ service_types: visible, total: visible.length, can_edit: canEdit });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/service-types  { updates: [{ id, standard_fee?, sac_code?, is_active? }] }
 * The master price list: the Managing Partner or Admin (manage_settings) change standard fees
 * (rupees before GST), SAC codes and whether a service is in use. Changing a standard fee does
 * not change engagements already created: each keeps the agreed fee it was given.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await userHasPermission(session.id, "manage_settings"))) {
      return NextResponse.json({ error: "Only the Managing Partner or Admin can change prices." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      updates?: { id?: string; standard_fee?: number | string | null; sac_code?: string | null; is_active?: boolean }[];
    };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 422 });
    if (updates.length > 400) return NextResponse.json({ error: "Save fewer than 400 services at a time." }, { status: 422 });

    let changed = 0;
    let unchanged = 0;
    const missing: string[] = [];

    for (const u of updates) {
      if (!u.id) continue;
      const cur = await query<{ id: string; name: string; standard_fee: string | null; sac_code: string | null; is_active: boolean }>(
        `SELECT id, name, standard_fee::text, sac_code, is_active FROM service_types WHERE id = $1 LIMIT 1`,
        [u.id],
      );
      if (cur.length === 0) {
        missing.push(u.id);
        continue;
      }
      const c = cur[0];

      const sets: string[] = [];
      const vals: unknown[] = [u.id];
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      if ("standard_fee" in u) {
        const blank = u.standard_fee === null || u.standard_fee === "" || u.standard_fee === undefined;
        const n = blank ? null : Number(u.standard_fee);
        if (!blank && (!Number.isFinite(n) || (n as number) < 0 || (n as number) > 100_000_000)) {
          return NextResponse.json({ error: `The fee for ${c.name} must be an amount of 0 or more.` }, { status: 422 });
        }
        const before = c.standard_fee === null ? null : Number(c.standard_fee);
        if (n !== before) {
          vals.push(n);
          sets.push(`standard_fee = $${vals.length}`);
          changes.standard_fee = { before, after: n };
        }
      }
      if ("sac_code" in u) {
        const raw = typeof u.sac_code === "string" ? u.sac_code.trim() : "";
        if (raw.length > 20) return NextResponse.json({ error: `The SAC code for ${c.name} is too long.` }, { status: 422 });
        const next = raw === "" ? null : raw;
        if (next !== (c.sac_code ?? null)) {
          vals.push(next);
          sets.push(`sac_code = $${vals.length}`);
          changes.sac_code = { before: c.sac_code ?? null, after: next };
        }
      }
      if (typeof u.is_active === "boolean" && u.is_active !== c.is_active) {
        vals.push(u.is_active);
        sets.push(`is_active = $${vals.length}`);
        changes.is_active = { before: c.is_active, after: u.is_active };
      }

      if (sets.length === 0) {
        unchanged++;
        continue;
      }
      await query(`UPDATE service_types SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, vals);
      await createAuditLog({
        action: "update",
        entity_type: "service_type",
        entity_id: c.id,
        field_changes: changes,
        user_id: session.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
      changed++;
    }

    return NextResponse.json({ changed, unchanged, missing: missing.length });
  } catch (err) {
    console.error("PATCH /api/service-types error:", err);
    return NextResponse.json({ error: "The prices couldn't be saved. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only roles with manage_settings permission can create service types
    const canManage = await userHasPermission(session.id, "manage_settings");
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to create service types" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      code,
      name,
      description,
      parent_service_id,
      is_attest,
      is_recurring,
      recurrence_pattern,
      default_billing_entity_id,
      linked_task_library_id,
      standard_fee,
      sac_code,
      is_active,
    } = body;

    // Validate required fields
    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "code is required" }, { status: 422 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 422 });
    }

    // Check for duplicate code
    const existing = await query<{ id: string }>(
      `SELECT id FROM service_types WHERE code = $1 LIMIT 1`,
      [code.trim()],
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Service type with code '${code}' already exists` },
        { status: 422 },
      );
    }

    const rows = await query<{ id: string; code: string; name: string }>(
      `INSERT INTO service_types (
        code, name, description, parent_service_id, is_attest, is_recurring,
        recurrence_pattern, default_billing_entity_id, linked_task_library_id,
        standard_fee, sac_code, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, code, name`,
      [
        code.trim(),
        name.trim(),
        description ?? null,
        parent_service_id ?? null,
        is_attest ?? false,
        is_recurring ?? false,
        recurrence_pattern ?? null,
        default_billing_entity_id ?? null,
        linked_task_library_id ?? null,
        standard_fee ?? null,
        sac_code ?? null,
        is_active ?? true,
      ],
    );

    return NextResponse.json({ service_type: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
