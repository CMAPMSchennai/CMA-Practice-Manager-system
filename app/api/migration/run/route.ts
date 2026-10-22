/**
 * POST /api/migration/run
 * US027-AC-1: Dry-run or live import with per-row validation
 * US027-AC-3 (negative): 403 for non-MP/Admin
 * Body: { dry_run: boolean, entity_type: string, source_data: Record<string,unknown>[] }
 * Returns: { batch_id, valid_rows, invalid_rows, duplicates }
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { fingerprint } from "@/lib/field-crypto";
import { SECURE_FIELD_TYPE, prepareClientPan, saveClientSecretMeta } from "@/lib/secure-fields";

type MigrationRow = Record<string, unknown>;

interface ValidationResult {
  row_index: number;
  row: MigrationRow;
  errors: string[];
  is_duplicate: boolean;
}

/** Validate a single row against entity_type rules */
async function validateRow(
  row: MigrationRow,
  entityType: string,
  index: number,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let is_duplicate = false;

  switch (entityType) {
    case "client": {
      if (!row.name) errors.push("name is required");
      if (!row.pan) errors.push("pan is required");
      if (row.pan && typeof row.pan === "string" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(row.pan)) {
        errors.push("pan format is invalid (expected AAAAA9999A)");
      }
      if (!row.contact_email) errors.push("contact_email is required");
      if (
        row.contact_email &&
        typeof row.contact_email === "string" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)
      ) {
        errors.push("contact_email format is invalid");
      }
      // Duplicate check: PAN (encrypted, so matched by fingerprint)
      if (row.pan && errors.length === 0) {
        const fp = fingerprint("pan", row.pan);
        const dup = fp
          ? await query<{ code: string }>(
              `SELECT code FROM reference_data
                WHERE type = $1 AND code LIKE 'client:%' AND metadata ->> 'pan_fp' = $2 LIMIT 1`,
              [SECURE_FIELD_TYPE, fp],
            )
          : [];
        if (dup.length > 0) is_duplicate = true;
      }
      break;
    }

    case "employee": {
      if (!row.first_name) errors.push("first_name is required");
      if (!row.last_name) errors.push("last_name is required");
      if (!row.email) errors.push("email is required");
      if (
        row.email &&
        typeof row.email === "string" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
      ) {
        errors.push("email format is invalid");
      }
      if (!row.position_type) errors.push("position_type is required");
      if (!row.date_of_joining) errors.push("date_of_joining is required");
      // Duplicate check: email
      if (row.email && errors.length === 0) {
        const dup = await query<{ id: string }>(
          `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
          [row.email],
        );
        if (dup.length > 0) is_duplicate = true;
      }
      break;
    }

    case "engagement": {
      if (!row.client_id) errors.push("client_id is required");
      if (!row.service_type_id) errors.push("service_type_id is required");
      if (!row.billing_entity_id) errors.push("billing_entity_id is required");
      if (!row.period_start) errors.push("period_start is required");
      // Validate FK references
      if (row.client_id) {
        const ref = await query<{ id: string }>(
          `SELECT id FROM clients WHERE id = $1 LIMIT 1`,
          [row.client_id],
        );
        if (ref.length === 0) errors.push(`client_id '${row.client_id}' not found`);
      }
      break;
    }

    default: {
      // Generic: just ensure there's at least one field
      if (Object.keys(row).length === 0) {
        errors.push("row has no fields");
      }
      break;
    }
  }

  return { row_index: index, row, errors, is_duplicate };
}

/** Insert a validated client row */
async function insertClient(row: MigrationRow, importedBy: string): Promise<string> {
  // NFR: PAN stored encrypted.
  const securePan = await prepareClientPan(row.pan);
  const rows = await query<{ id: string }>(
    `INSERT INTO clients (
       id, name, pan, contact_email, contact_phone, onboarding_status, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, 'imported', now(), now()
     ) RETURNING id`,
    [row.name, securePan.column, row.contact_email, row.contact_phone ?? null],
  );
  await saveClientSecretMeta(rows[0].id, securePan.meta);
  void importedBy; // audit
  return rows[0].id;
}

/** Insert a validated employee row */
async function insertEmployee(row: MigrationRow, _importedBy: string): Promise<string> {
  // Auto-generate employee_id_code
  const codeRows = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM employees`,
  );
  const cnt = Number(codeRows[0].cnt) + 1;
  const employeeIdCode = `EMP${String(cnt).padStart(4, "0")}`;

  const rows = await query<{ id: string }>(
    `INSERT INTO employees (
       id, employee_id_code, first_name, last_name, email, phone,
       position_type, designation, date_of_joining, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::date, now(), now()
     ) RETURNING id`,
    [
      employeeIdCode,
      row.first_name,
      row.last_name,
      row.email,
      row.phone ?? null,
      row.position_type,
      row.designation ?? null,
      row.date_of_joining,
    ],
  );
  return rows[0].id;
}

export async function POST(req: NextRequest) {
  // Role gate: only managing_partner and admin can run migrations
  let userId: string;
  try {
    const user = await requirePermission(req, "manage_settings");
    userId = user.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = await req.json();
    const {
      dry_run = true,
      entity_type = "client",
      source_data = [],
    } = body as {
      dry_run?: boolean;
      entity_type?: string;
      source_data?: MigrationRow[];
    };

    if (!Array.isArray(source_data) || source_data.length === 0) {
      return NextResponse.json(
        { error: "source_data must be a non-empty array." },
        { status: 422 },
      );
    }

    if (source_data.length > 5000) {
      return NextResponse.json(
        { error: "source_data exceeds the maximum batch size of 5000 rows." },
        { status: 422 },
      );
    }

    // Validate all rows
    const validationResults: ValidationResult[] = [];
    for (let i = 0; i < source_data.length; i++) {
      const result = await validateRow(source_data[i], entity_type, i);
      validationResults.push(result);
    }

    const validRows = validationResults.filter(
      (r) => r.errors.length === 0 && !r.is_duplicate,
    );
    const invalidRows = validationResults.filter((r) => r.errors.length > 0);
    const duplicates = validationResults.filter(
      (r) => r.errors.length === 0 && r.is_duplicate,
    );

    // Generate batch ID
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (dry_run) {
      // Dry run: no DB writes, just return validation summary
      return NextResponse.json({
        batch_id: batchId,
        dry_run: true,
        entity_type,
        total_rows: source_data.length,
        valid_rows: validRows.length,
        invalid_rows: invalidRows.length,
        duplicates: duplicates.length,
        validation_errors: invalidRows.map((r) => ({
          row_index: r.row_index,
          errors: r.errors,
        })),
        duplicate_rows: duplicates.map((r) => r.row_index),
      });
    }

    // Live run: insert valid rows
    const insertedIds: string[] = [];
    const insertErrors: { row_index: number; error: string }[] = [];

    for (const vr of validRows) {
      try {
        let insertedId: string;
        if (entity_type === "client") {
          insertedId = await insertClient(vr.row, userId);
        } else if (entity_type === "employee") {
          insertedId = await insertEmployee(vr.row, userId);
        } else {
          // Generic: skip actual insert, just record
          insertedId = `skipped_${vr.row_index}`;
        }
        insertedIds.push(insertedId);
      } catch (insertErr: unknown) {
        const msg =
          insertErr instanceof Error
            ? insertErr.message
            : "Insert failed";
        insertErrors.push({ row_index: vr.row_index, error: msg });
      }
    }

    // Record migration batch in audit_logs for rollback tracking
    await query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, field_changes, user_id, created_at)
       VALUES (gen_random_uuid(), 'migration_run', 'migration', $1, $2, $3, now())`,
      [
        batchId,
        JSON.stringify({
          batch_id: batchId,
          entity_type,
          total_rows: source_data.length,
          valid_rows: validRows.length,
          invalid_rows: invalidRows.length,
          duplicates: duplicates.length,
          inserted_ids: insertedIds,
          insert_errors: insertErrors,
          dry_run: false,
        }),
        userId,
      ],
    );

    return NextResponse.json({
      batch_id: batchId,
      dry_run: false,
      entity_type,
      total_rows: source_data.length,
      valid_rows: validRows.length,
      invalid_rows: invalidRows.length,
      duplicates: duplicates.length,
      inserted_count: insertedIds.length,
      insert_errors: insertErrors,
      validation_errors: invalidRows.map((r) => ({
        row_index: r.row_index,
        errors: r.errors,
      })),
      duplicate_rows: duplicates.map((r) => r.row_index),
    });
  } catch (err: unknown) {
    console.error("POST /api/migration/run error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
