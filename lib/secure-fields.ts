/**
 * Encrypted PAN, Aadhaar, bank account and salary for employees and clients
 * (NFR field-level encryption; FR-04 visibility still applies on top).
 *
 * PAN, Aadhaar and bank account number are stored encrypted in their own
 * columns. Salary's column only accepts numbers, so the encrypted salary is
 * kept in reference_data (type 'secure_field', code 'employee:<id>') and the
 * column stays empty. The same row holds one-way fingerprints of PAN and
 * Aadhaar so duplicates can still be detected. This side store is a stop-gap
 * until schema changes are possible again (Dual7 migration 0042).
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  EncryptionKeyMissingError,
  decryptField,
  encryptField,
  fingerprint,
} from "@/lib/field-crypto";

export const SECURE_FIELD_TYPE = "secure_field";

type Owner = "employee" | "client";

interface SecureMeta {
  salary?: string | null;
  pan_fp?: string | null;
  aadhaar_fp?: string | null;
}

export class DuplicateIdentifierError extends Error {
  constructor(public field: "pan" | "aadhaar", owner: Owner) {
    super(
      field === "pan"
        ? `Another ${owner} already has this PAN.`
        : `Another ${owner} already has this Aadhaar number.`,
    );
    this.name = "DuplicateIdentifierError";
  }
}

export class ProtectedFieldInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedFieldInvalidError";
  }
}

/** Route helper: plain-language responses for encryption, duplicate and format errors. */
export function secureFieldErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof EncryptionKeyMissingError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  if (err instanceof DuplicateIdentifierError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof ProtectedFieldInvalidError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  return null;
}

function metaCode(owner: Owner, id: string): string {
  return `${owner}:${id}`;
}

async function readMeta(owner: Owner, ids: string[]): Promise<Map<string, SecureMeta>> {
  const out = new Map<string, SecureMeta>();
  if (ids.length === 0) return out;
  const rows = await query<{ code: string; metadata: SecureMeta | null }>(
    `SELECT code, metadata FROM reference_data WHERE type = $1 AND code = ANY($2::text[])`,
    [SECURE_FIELD_TYPE, ids.map((id) => metaCode(owner, id))],
  );
  for (const r of rows) out.set(r.code.slice(owner.length + 1), r.metadata ?? {});
  return out;
}

async function writeMeta(owner: Owner, id: string, patch: SecureMeta): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, 'Protected fields', 0, true, $3::jsonb)
     ON CONFLICT (type, code) DO UPDATE
       SET metadata = COALESCE(reference_data.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = now()`,
    [SECURE_FIELD_TYPE, metaCode(owner, id), JSON.stringify(patch)],
  );
}

/** Raw (still encrypted) side data, for an import rollback snapshot. */
export async function getSecureMetaRaw(owner: Owner, id: string): Promise<SecureMeta | null> {
  const rows = await query<{ metadata: SecureMeta | null }>(
    `SELECT metadata FROM reference_data WHERE type = $1 AND code = $2 LIMIT 1`,
    [SECURE_FIELD_TYPE, metaCode(owner, id)],
  );
  return rows.length ? rows[0].metadata ?? {} : null;
}

/** Put back a snapshot taken with getSecureMetaRaw (null removes the row). */
export async function restoreSecureMeta(owner: Owner, id: string, meta: SecureMeta | null): Promise<void> {
  if (meta === null) {
    await clearSecureMeta(owner, id);
    return;
  }
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, 'Protected fields', 0, true, $3::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [SECURE_FIELD_TYPE, metaCode(owner, id), JSON.stringify(meta)],
  );
}

/** Remove an owner's protected side data (DPDP erasure). */
export async function clearSecureMeta(owner: Owner, id: string): Promise<void> {
  await query(`DELETE FROM reference_data WHERE type = $1 AND code = $2`, [
    SECURE_FIELD_TYPE,
    metaCode(owner, id),
  ]);
}

async function assertUnique(
  owner: Owner,
  field: "pan" | "aadhaar",
  fp: string | null,
  excludeId?: string,
): Promise<void> {
  if (!fp) return;
  const rows = await query<{ code: string }>(
    `SELECT code FROM reference_data
      WHERE type = $1 AND code LIKE $2 AND metadata ->> $3 = $4 AND code <> $5
      LIMIT 1`,
    [SECURE_FIELD_TYPE, `${owner}:%`, `${field}_fp`, fp, excludeId ? metaCode(owner, excludeId) : ""],
  );
  if (rows.length > 0) throw new DuplicateIdentifierError(field, owner);
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/* ------------------------------------------------------------------ */
/*  Employees                                                         */
/* ------------------------------------------------------------------ */

export const EMPLOYEE_SECRET_FIELDS = ["pan", "aadhaar", "bank_account_no", "salary"] as const;

export interface PreparedEmployeeSecrets {
  /** Column values to write (encrypted; salary always null). */
  columns: Partial<Record<"pan" | "aadhaar" | "bank_account_no" | "salary", string | null>>;
  meta: SecureMeta;
}

/**
 * Encrypt whichever of pan / aadhaar / bank_account_no / salary are present in
 * `input`, and check PAN and Aadhaar are not already used by another employee.
 * Throws EncryptionKeyMissingError or DuplicateIdentifierError.
 */
export async function prepareEmployeeSecrets(
  input: Record<string, unknown>,
  excludeEmployeeId?: string,
): Promise<PreparedEmployeeSecrets> {
  const columns: PreparedEmployeeSecrets["columns"] = {};
  const meta: SecureMeta = {};

  if ("pan" in input) {
    const pan = textOrNull(input.pan)?.toUpperCase().replace(/\s/g, "") ?? null;
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      throw new ProtectedFieldInvalidError("PAN must be 10 characters in the form AAAAA9999A");
    }
    columns.pan = encryptField(pan);
    meta.pan_fp = fingerprint("pan", pan);
    await assertUnique("employee", "pan", meta.pan_fp, excludeEmployeeId);
  }
  if ("aadhaar" in input) {
    const aadhaar = textOrNull(input.aadhaar)?.replace(/[\s-]/g, "") ?? null;
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) {
      throw new ProtectedFieldInvalidError("Aadhaar must be 12 digits");
    }
    columns.aadhaar = encryptField(aadhaar);
    meta.aadhaar_fp = fingerprint("aadhaar", aadhaar);
    await assertUnique("employee", "aadhaar", meta.aadhaar_fp, excludeEmployeeId);
  }
  if ("bank_account_no" in input) {
    columns.bank_account_no = encryptField(textOrNull(input.bank_account_no));
  }
  if ("salary" in input) {
    const raw = textOrNull(input.salary);
    const amount = raw === null ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      throw new ProtectedFieldInvalidError("Salary must be a positive number");
    }
    meta.salary = amount === null ? null : encryptField(String(amount));
    columns.salary = null;
  }
  return { columns, meta };
}

export async function saveEmployeeSecretMeta(employeeId: string, meta: SecureMeta): Promise<void> {
  await writeMeta("employee", employeeId, meta);
}

export interface EmployeeSecrets {
  pan: string | null;
  aadhaar: string | null;
  bank_account_no: string | null;
  salary: number | null;
}

/** Decrypted values for one employee row (legacy plain values pass through). */
export async function readEmployeeSecrets(row: {
  id: string;
  pan: string | null;
  aadhaar: string | null;
  bank_account_no: string | null;
  salary: string | number | null;
}): Promise<EmployeeSecrets> {
  const salaries = await readEmployeeSalaries([row.id], new Map([[row.id, row.salary]]));
  return {
    pan: decryptField(row.pan),
    aadhaar: decryptField(row.aadhaar),
    bank_account_no: decryptField(row.bank_account_no),
    salary: salaries.get(row.id) ?? null,
  };
}

/**
 * Decrypted salaries for several employees. `legacy` holds the plain salary
 * column, used only when no encrypted salary is stored.
 */
export async function readEmployeeSalaries(
  ids: string[],
  legacy: Map<string, string | number | null> = new Map(),
): Promise<Map<string, number | null>> {
  const meta = await readMeta("employee", ids);
  const out = new Map<string, number | null>();
  for (const id of ids) {
    const m = meta.get(id);
    let value: number | null = null;
    if (m && "salary" in m) {
      const plain = decryptField(m.salary ?? null);
      value = plain === null ? null : Number(plain);
    } else {
      const old = legacy.get(id);
      value = old === null || old === undefined ? null : Number(old);
    }
    out.set(id, value !== null && Number.isFinite(value) ? value : null);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Clients                                                           */
/* ------------------------------------------------------------------ */

/**
 * Encrypt a client PAN. Duplicates are not blocked here; the conflict check
 * reports them (existing behaviour), using the fingerprint.
 */
export async function prepareClientPan(
  pan: unknown,
): Promise<{ column: string | null; meta: SecureMeta }> {
  const value = textOrNull(pan)?.toUpperCase() ?? null;
  return { column: encryptField(value), meta: { pan_fp: fingerprint("pan", value) } };
}

export async function saveClientSecretMeta(clientId: string, meta: SecureMeta): Promise<void> {
  await writeMeta("client", clientId, meta);
}

/** Other clients with the same PAN (by fingerprint). */
export async function clientsWithSamePan(clientId: string, pan: string | null): Promise<string[]> {
  const fp = fingerprint("pan", decryptField(pan));
  if (!fp) return [];
  const rows = await query<{ code: string }>(
    `SELECT code FROM reference_data
      WHERE type = $1 AND code LIKE 'client:%' AND metadata ->> 'pan_fp' = $2 AND code <> $3`,
    [SECURE_FIELD_TYPE, fp, metaCode("client", clientId)],
  );
  return rows.map((r) => r.code.slice("client:".length));
}
