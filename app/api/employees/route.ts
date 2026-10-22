/**
 * POST /api/employees — create a new employee (admin, managing_partner, partner)
 * GET  /api/employees — list employees; supports ?expiring_articleship=true
 *
 * US008 / US009 acceptance criteria
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName, userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { syncEmployeeChecklistNow } from "@/lib/employee-checklist";
import { DetailError, acceptUndertaking, buildDetailUpdate, saveDetailUpdate } from "@/lib/employee-details";
import {
  EMPLOYEE_SECRET_FIELDS,
  prepareEmployeeSecrets,
  saveEmployeeSecretMeta,
  secureFieldErrorResponse,
} from "@/lib/secure-fields";

/** Generate the next CMA-AC## style employee ID for articled clerks */
async function generateEmployeeIdCode(positionType: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    partner: "CMA-P",
    paid_assistant: "CMA-PA",
    articled_clerk: "CMA-AC",
    support_staff: "CMA-S",
  };
  const prefix = prefixMap[positionType] ?? "CMA-EMP";

  // Highest number used with exactly this prefix followed by digits. Compared
  // numerically, so CMA-AC10 beats CMA-AC9 and CMA-P never matches CMA-PA.
  const rows = await query<{ max_num: number | null }>(
    `SELECT MAX(substring(employee_id_code FROM $1)::int) AS max_num
       FROM employees
      WHERE employee_id_code ~ $2`,
    [`^${prefix}([0-9]+)$`, `^${prefix}[0-9]+$`],
  );
  const next = (rows[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

/** Plain-language message for a unique-constraint clash on employees. */
function duplicateMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string; detail?: string };
  if (e?.code !== "23505") return null;
  const where = `${e.constraint ?? ""} ${e.detail ?? ""}`.toLowerCase();
  if (where.includes("email")) return "Another employee already uses this email address.";
  if (where.includes("pan")) return "Another employee already has this PAN.";
  if (where.includes("aadhaar")) return "Another employee already has this Aadhaar number.";
  if (where.includes("user_id")) return "This login is already linked to another employee.";
  return "An employee with these details already exists.";
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only roles with create_employees permission can create
    const canCreate = await userHasPermission(session.id, "create_employees");
    if (!canCreate) {
      return NextResponse.json(
        { error: "You do not have permission to create employees" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      position_type,
      designation,
      payroll_entity_id,
      date_of_joining,
      date_of_leaving,
      bank_ifsc,
      icai_membership_no,
      icai_registration_no,
      articleship_start_date,
      articleship_end_date,
      assigned_mentor_partner_id,
      user_id,
      status,
      confidentiality_undertaking_signed,
    } = body;

    // Validate required fields
    if (!first_name || typeof first_name !== "string" || !first_name.trim()) {
      return NextResponse.json(
        { error: "first_name is required" },
        { status: 422 },
      );
    }
    if (!position_type) {
      return NextResponse.json(
        { error: "position_type is required" },
        { status: 422 },
      );
    }
    const validPositionTypes = [
      "partner",
      "paid_assistant",
      "articled_clerk",
      "support_staff",
    ];
    if (!validPositionTypes.includes(position_type)) {
      return NextResponse.json(
        {
          error: `position_type must be one of: ${validPositionTypes.join(", ")}`,
        },
        { status: 422 },
      );
    }
    if (!payroll_entity_id) {
      return NextResponse.json(
        { error: "payroll_entity_id is required" },
        { status: 422 },
      );
    }

    // Validate payroll entity exists
    const entityRows = await query<{ id: string }>(
      `SELECT id FROM entities WHERE id = $1 LIMIT 1`,
      [payroll_entity_id],
    );
    if (entityRows.length === 0) {
      return NextResponse.json(
        { error: "payroll_entity_id does not reference a valid entity" },
        { status: 422 },
      );
    }

    // NFR: PAN, Aadhaar, bank account and salary are stored encrypted.
    const secretInput: Record<string, unknown> = {};
    for (const f of EMPLOYEE_SECRET_FIELDS) if (f in body) secretInput[f] = body[f];
    const secrets = await prepareEmployeeSecrets(secretInput);

    // FR-38: personal, qualification, ICAI, past-experience, bank and emergency details.
    const details = buildDetailUpdate(body);
    const undertaking = (body.accept_undertaking && typeof body.accept_undertaking === "object" ? body.accept_undertaking : null) as {
      signatory?: string;
      place?: string;
    } | null;
    if (undertaking && !String(undertaking.signatory ?? "").trim()) {
      return NextResponse.json({ error: "Type the employee's full name to accept the undertaking." }, { status: 422 });
    }

    const employee_id_code = await generateEmployeeIdCode(position_type);

    // Helper: treat empty string as null for DATE columns
    const toDate = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null;

    const insertRows = await query<{ id: string; employee_id_code: string }>(
      `INSERT INTO employees (
        employee_id_code, user_id, first_name, last_name, email, phone,
        position_type, designation, payroll_entity_id, date_of_joining,
        date_of_leaving, salary, pan, aadhaar, bank_account_no, bank_ifsc,
        icai_membership_no, icai_registration_no, articleship_start_date,
        articleship_end_date, assigned_mentor_partner_id,
        confidentiality_undertaking_signed, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, $23
      )
      RETURNING id, employee_id_code`,
      [
        employee_id_code,
        user_id ?? null,
        first_name.trim(),
        last_name ?? null,
        email ?? null,
        phone ?? null,
        position_type,
        designation ?? null,
        payroll_entity_id,
        toDate(date_of_joining),
        toDate(date_of_leaving),
        null,
        secrets.columns.pan ?? null,
        secrets.columns.aadhaar ?? null,
        secrets.columns.bank_account_no ?? null,
        bank_ifsc ?? null,
        icai_membership_no ?? null,
        icai_registration_no || null,
        toDate(articleship_start_date),
        toDate(articleship_end_date),
        assigned_mentor_partner_id ?? null,
        false, // set only by accepting the undertaking below (FR-39)
        status ?? "active",
      ],
    );

    const created = insertRows[0];
    await saveEmployeeSecretMeta(created.id, secrets.meta);
    await query(`UPDATE employees SET created_by = $1 WHERE id = $2`, [session.id, created.id]);
    await saveDetailUpdate(created.id, details, session.id);
    if (undertaking) {
      await acceptUndertaking(created.id, String(undertaking.signatory), String(undertaking.place ?? ""));
    }

    // Onboarding document checklist from the requirements, by position type (FR-05, FR-42)
    await syncEmployeeChecklistNow(created.id);

    // FR-02 (Gap #81): record who added the employee. Pay and ID values are not written out.
    await createAuditLog({
      action: "create",
      entity_type: "employees",
      entity_id: created.id,
      field_changes: {
        created: {
          before: null,
          after: { employee_id_code: created.employee_id_code, name: `${first_name.trim()} ${last_name ?? ""}`.trim(), position_type },
        },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json(
      { employee: { id: created.id, employee_id_code: created.employee_id_code } },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof DetailError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const protectedError = secureFieldErrorResponse(err);
    if (protectedError) return protectedError;
    console.error(err);
    const duplicate = duplicateMessage(err);
    if (duplicate) {
      return NextResponse.json({ error: duplicate }, { status: 409 });
    }
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canView = await userHasPermission(session.id, "view_employees");
    const canViewOwn = await userHasPermission(session.id, "view_own_employee");

    if (!canView && !canViewOwn) {
      return NextResponse.json(
        { error: "You do not have permission to view employees" },
        { status: 403 },
      );
    }

    const sp = req.nextUrl.searchParams;
    const expiringArticleship = sp.get("expiring_articleship");
    const positionType = sp.get("position_type");
    const statusFilter = sp.get("status");
    const entityId = sp.get("entity_id");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("page_size") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // If user can only view own employee record, restrict to their employee link
    if (!canView && canViewOwn) {
      conditions.push(`user_id = $${idx++}`);
      values.push(session.id);
    }

    if (expiringArticleship === "true") {
      conditions.push(`position_type = 'articled_clerk'`);
      conditions.push(
        `articleship_end_date IS NOT NULL AND articleship_end_date BETWEEN now() AND now() + INTERVAL '60 days'`,
      );
    }

    if (positionType) {
      conditions.push(`position_type = $${idx++}`);
      values.push(positionType);
    }

    if (statusFilter) {
      conditions.push(`status = $${idx++}`);
      values.push(statusFilter);
    }

    if (entityId) {
      conditions.push(`payroll_entity_id = $${idx++}`);
      values.push(entityId);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRows = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM employees ${where}`,
      values,
    );
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const rows = await query(
      `SELECT id, employee_id_code, user_id, first_name, last_name, email, phone,
              position_type, designation, payroll_entity_id, date_of_joining,
              date_of_leaving, articleship_start_date, articleship_end_date,
              assigned_mentor_partner_id, status, version, created_at, updated_at
         FROM employees
         ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset],
    );

    return NextResponse.json({
      can_create: await userHasPermission(session.id, "create_employees"),
      employees: rows,
      pagination: {
        total,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
