/**
 * GET   /api/employees/:id — get employee by ID
 * PATCH /api/employees/:id — update employee
 *
 * US008-AC-2: articled_clerk accessing another employee's record → 403
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName, userHasPermission } from "@/lib/rbac";
import { canViewCompensation, maskLast4 } from "@/lib/sensitive-data";
import { getExtras, visibleExtras } from "@/lib/record-extras";
import {
  EMPLOYEE_SECRET_FIELDS,
  prepareEmployeeSecrets,
  readEmployeeSecrets,
  saveEmployeeSecretMeta,
  secureFieldErrorResponse,
} from "@/lib/secure-fields";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { DetailError, acceptUndertaking, buildDetailUpdate, readCtc, saveDetailUpdate } from "@/lib/employee-details";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const rows = await query<{
      id: string;
      employee_id_code: string;
      user_id: string | null;
      first_name: string;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      position_type: string;
      designation: string | null;
      payroll_entity_id: string;
      date_of_joining: string | null;
      date_of_leaving: string | null;
      salary: number | null;
      pan: string | null;
      aadhaar: string | null;
      bank_account_no: string | null;
      bank_ifsc: string | null;
      icai_membership_no: string | null;
      icai_registration_no: string | null;
      articleship_start_date: string | null;
      articleship_end_date: string | null;
      assigned_mentor_partner_id: string | null;
      confidentiality_undertaking_signed: boolean;
      status: string;
      version: number;
      created_at: string;
      updated_at: string;
    }>(`SELECT * FROM employees WHERE id = $1 LIMIT 1`, [id]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const employee = rows[0];
    const isOwnRecord = employee.user_id === session.id;

    // Check permissions
    const canViewAll = await userHasPermission(session.id, "view_employees");
    const canViewOwn = await userHasPermission(session.id, "view_own_employee");

    if (!canViewAll && !canViewOwn) {
      return NextResponse.json(
        { error: "You do not have permission to view employees" },
        { status: 403 },
      );
    }

    // If user can only view own record, reject access to other records
    if (!canViewAll && canViewOwn && !isOwnRecord) {
      return NextResponse.json(
        { error: "You do not have permission to view this employee record" },
        { status: 403 },
      );
    }

    // Stored encrypted (NFR); decrypt before applying visibility rules.
    const secrets = await readEmployeeSecrets(employee);

    // FR-04 / NFR-03 / AC-10: salary and bank only for MP, Partners and Admin, not even
    // for the employee themself (Gap #75); everyone else sees PAN / Aadhaar masked to the last 4.
    const compensationRole = canViewCompensation(await getUserRoleName(session.id));
    const canSeePay = compensationRole;
    // Only MP, Partner and Admin may change pay and ID details, and only with edit access (FR-04).
    const canEditPay = compensationRole && (await userHasPermission(session.id, "edit_employees"));
    // Workbook details without a column yet (Gaps #38, #40); bank / CTC extras follow FR-04.
    const extras = visibleExtras("employee", await getExtras("employee", employee.id), canSeePay);
    let result = {
      ...employee,
      ...secrets,
      // Last drawn CTC is protected like salary (FR-04).
      last_drawn_ctc: canSeePay ? readCtc((employee as unknown as Record<string, unknown>).last_drawn_ctc) : null,

      extra_details: extras,
      pay_visible: canSeePay,
      can_edit_pay: canEditPay,
      // Gap #47: staff who only see their own record get a "My profile" view.
      can_view_all: canViewAll,
      can_edit: await userHasPermission(session.id, "edit_employees"),
    };
    if (!canSeePay) {
      result = {
        ...result,
        salary: null,
        bank_account_no: maskLast4(secrets.bank_account_no),
        bank_ifsc: null,
        bank_name: null,
        bank_branch: null,
        bank_account_holder: null,
        pan: maskLast4(secrets.pan),
        aadhaar: maskLast4(secrets.aadhaar),
      };
    }

    return NextResponse.json({ employee: result });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const canEdit = await userHasPermission(session.id, "edit_employees");
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit employees" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await req.json();

    // FR-04: only MP, Partners and Admin may change salary, bank, PAN or Aadhaar.
    const compensationFields = ["salary", "bank_account_no", "bank_ifsc", "pan", "aadhaar", "last_drawn_ctc"];
    if (
      compensationFields.some((f) => f in body) &&
      !canViewCompensation(await getUserRoleName(session.id))
    ) {
      return NextResponse.json(
        { error: "You do not have permission to change salary or bank details" },
        { status: 403 },
      );
    }

    const existing = await query<{ id: string; version: number }>(
      `SELECT id, version FROM employees WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const allowedFields = [
      "first_name", "last_name", "email", "phone", "designation",
      "date_of_joining", "date_of_leaving", "salary", "pan", "aadhaar",
      "bank_account_no", "bank_ifsc", "icai_membership_no", "icai_registration_no",
      "articleship_start_date", "articleship_end_date", "assigned_mentor_partner_id",
      "status",
    ];

    // NFR: PAN, Aadhaar, bank account and salary are stored encrypted.
    const secretInput: Record<string, unknown> = {};
    for (const f of EMPLOYEE_SECRET_FIELDS) if (f in body) secretInput[f] = body[f];
    const secrets = await prepareEmployeeSecrets(secretInput, id);
    const secretColumns = secrets.columns as Record<string, string | null>;
    if ("bank_ifsc" in body) {
      const ifsc = typeof body.bank_ifsc === "string" ? body.bank_ifsc.trim().toUpperCase() : "";
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return NextResponse.json(
          { error: "IFSC must be 11 characters, for example SBIN0001234" },
          { status: 422 },
        );
      }
      body.bank_ifsc = ifsc || null;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (field in body) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(field in secretColumns ? secretColumns[field] : body[field] ?? null);
      }
    }

    // FR-38: the staff form's extra details, and the one-time undertaking acceptance (FR-39).
    const details = buildDetailUpdate(body);
    const undertaking = (body.accept_undertaking && typeof body.accept_undertaking === "object" ? body.accept_undertaking : null) as {
      signatory?: string;
      place?: string;
    } | null;

    if (setClauses.length === 0 && Object.keys(details).length === 0 && !undertaking) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
    }

    // FR-02 (Gap #81): remember what the plain fields held, to record what changed.
    // Pay and ID fields are never written out; they are only marked as changed.
    const SENSITIVE = ["salary", "pan", "aadhaar", "bank_account_no", "bank_ifsc", "last_drawn_ctc"];
    const plainFields = allowedFields.filter((f) => f in body && !SENSITIVE.includes(f));
    const beforeRow = plainFields.length
      ? ((await query<Record<string, unknown>>(`SELECT ${plainFields.join(", ")} FROM employees WHERE id = $1`, [id]))[0] ?? {})
      : {};

    let result: { id: string; employee_id_code: string } = { id, employee_id_code: "" };
    if (setClauses.length > 0) {
      setClauses.push(`version = version + 1`);
      setClauses.push(`updated_by = $${idx++}`);
      values.push(session.id);
      setClauses.push(`updated_at = now()`);
      values.push(id);
      const updated = await query<{ id: string; employee_id_code: string }>(
        `UPDATE employees SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, employee_id_code`,
        values,
      );
      result = updated[0];
      await saveEmployeeSecretMeta(id, secrets.meta);
    }
    await saveDetailUpdate(id, details, session.id);
    if (undertaking) {
      await acceptUndertaking(id, String(undertaking.signatory ?? ""), String(undertaking.place ?? ""));
    }

    const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const f of plainFields) {
      if (norm(beforeRow[f]) !== norm(body[f])) changes[f] = { before: beforeRow[f] ?? null, after: body[f] ?? null };
    }
    for (const f of SENSITIVE) {
      if (f in body) changes[f] = { before: "(protected)", after: "(changed)" };
    }
    const detailKeys = Object.keys(details);
    if (detailKeys.length > 0) changes.details = { before: null, after: `updated: ${detailKeys.join(", ")}` };
    if (undertaking) changes.confidentiality_undertaking = { before: null, after: "accepted" };
    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        action: "update",
        entity_type: "employees",
        entity_id: id,
        field_changes: changes,
        user_id: session.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json({ employee: result });
  } catch (err: unknown) {
    if (err instanceof DetailError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const protectedError = secureFieldErrorResponse(err);
    if (protectedError) return protectedError;
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
