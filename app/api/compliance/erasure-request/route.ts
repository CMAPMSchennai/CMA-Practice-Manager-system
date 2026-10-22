/**
 * POST /api/compliance/erasure-request — DPDP Act erasure request
 *
 * AC: US031-AC-2 — POST with { user_id, reason } → 200 with { anonymised_fields }
 * AC: US031-AC-3 — POST without manage_erasure permission → 403
 *
 * Only Managing Partner can initiate erasure requests.
 * This anonymises PII fields in the employees table and
 * redacts audit log field_changes for the affected user.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { clearSecureMeta } from "@/lib/secure-fields";

const PII_FIELDS = [
  "pan",
  "aadhaar",
  "bank_account_no",
  "bank_ifsc",
  "salary",
  "phone",
  "email",
  "first_name",
  "last_name",
];

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only managing_partner can request erasure
    const roleName = await getUserRoleName(session.id);
    if (roleName !== "managing_partner") {
      return NextResponse.json(
        { error: "Only Managing Partner can initiate erasure requests" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { user_id, reason } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 422 });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 422 });
    }

    // Find the employee record for this user
    const employees = await query<{ id: string; first_name: string; last_name: string | null }>(
      `SELECT id, first_name, last_name FROM employees WHERE user_id = $1 LIMIT 1`,
      [user_id],
    );

    const anonymisedFields: string[] = [];

    if (employees.length > 0) {
      const empId = employees[0].id;

      // Anonymise PII fields in the employee record
      await query(
        `UPDATE employees SET
          first_name = '[REDACTED]',
          last_name = '[REDACTED]',
          email = '[REDACTED]',
          phone = '[REDACTED]',
          pan = '[REDACTED]',
          aadhaar = '[REDACTED]',
          bank_account_no = '[REDACTED]',
          bank_ifsc = '[REDACTED]',
          salary = NULL,
          updated_at = now()
        WHERE id = $1`,
        [empId],
      );
      // Encrypted salary and PAN / Aadhaar fingerprints live in the side store.
      await clearSecureMeta("employee", empId);
      anonymisedFields.push(...PII_FIELDS);
    }

    // Also anonymise the user record
    await query(
      `UPDATE users SET
        name = '[REDACTED]',
        email = '[REDACTED]',
        image = NULL,
        updated_at = now()
      WHERE id = $1`,
      [user_id],
    );
    anonymisedFields.push("name", "user_email", "image");

    // Redact audit log entries for this user's PII
    // We don't delete audit logs (immutable), but we redact the field_changes
    await query(
      `UPDATE audit_logs SET
        field_changes = '{"redacted": true, "reason": "DPDP erasure request"}'::jsonb
      WHERE user_id = $1 AND field_changes IS NOT NULL`,
      [user_id],
    );

    // Log the erasure action itself
    await createAuditLog({
      action: "delete",
      entity_type: "users",
      entity_id: user_id,
      field_changes: {
        erasure_request: {
          before: null,
          after: { reason: reason.trim(), anonymised_fields: anonymisedFields },
        },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      anonymised_fields: anonymisedFields,
      message: "Erasure request processed. PII fields anonymised and audit logs redacted.",
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
