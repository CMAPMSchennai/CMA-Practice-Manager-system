/**
 * Audit trail (FR-02).
 *
 * Every entry is appended, never edited by the app, and chained: each row
 * stores the hash of the row before it (prev_hash) and its own hash
 * (row_hash, a SHA-256 over its content and prev_hash). Changing, removing or
 * inserting a row anywhere breaks the chain, and verifyAuditChain() finds it.
 * That makes the log tamper-evident. A database administrator could still
 * alter rows directly, but could not do so without the verification showing it.
 *
 * Rows written by other code (the importer writes some directly) are sealed
 * into the chain the next time an entry is added.
 *
 * Each entry also stamps who created or last changed the record it concerns
 * (created_by / updated_by) on the main business tables.
 */
import { createHash, randomUUID } from "crypto";
import { pool, query } from "@/lib/db";

export interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id: string;
  field_changes?: Record<string, { before: unknown; after: unknown }> | null;
  user_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

/** JSON with sorted keys, so the same data always gives the same text. */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

interface HashInput {
  id: string;
  action: string | null;
  entity_type: string;
  entity_id: string | null;
  field_changes: unknown;
  user_id: string | null;
  created_at: Date | string;
  prev_hash: string | null;
}

function hashRow(r: HashInput): string {
  const at = new Date(r.created_at).toISOString();
  const text = [
    r.prev_hash ?? "",
    r.id,
    r.action ?? "",
    r.entity_type,
    r.entity_id ?? "",
    canonical(r.field_changes ?? null),
    r.user_id ?? "",
    at,
  ].join("|");
  return createHash("sha256").update(text).digest("hex");
}

/** Which table holds the record an audit entry is about, for the created_by / updated_by stamps. */
const STAMP_TABLE: Record<string, string> = {
  clients: "clients",
  client: "clients",
  employees: "employees",
  employee: "employees",
  engagement: "engagements",
  engagements: "engagements",
  task_instance: "task_instances",
  task_instances: "task_instances",
  invoice: "invoices",
  invoices: "invoices",
  receipt: "receipts",
  expense: "expenses",
  document: "documents",
  payroll_readiness: "payroll_readiness",
  client_groups: "client_groups",
};

const CREATING = /^(create|upload|add|bulk_create|import)/;

async function stamp(entry: AuditLogEntry): Promise<void> {
  const table = STAMP_TABLE[entry.entity_type];
  if (!table || !entry.entity_id || !entry.user_id) return;
  try {
    if (CREATING.test(entry.action)) {
      await query(
        `UPDATE ${table}
            SET created_by = COALESCE(created_by, $2::uuid), updated_by = $2::uuid
          WHERE id = $1::uuid`,
        [entry.entity_id, entry.user_id],
      );
    } else {
      await query(`UPDATE ${table} SET updated_by = $2::uuid WHERE id = $1::uuid`, [entry.entity_id, entry.user_id]);
    }
  } catch {
    // The audit entry itself is already safe; a missing stamp must not fail the action.
  }
}

/**
 * Seal any rows that were written without a hash, oldest first, onto the end
 * of the chain. Called with the chain lock held.
 */
async function sealLegacy(client: import("pg").PoolClient): Promise<number> {
  const loose = await client.query<HashInput>(
    `SELECT id, action, entity_type, entity_id, field_changes, user_id, created_at
       FROM audit_logs WHERE row_hash IS NULL ORDER BY created_at ASC, id ASC`,
  );
  if (loose.rows.length === 0) return 0;
  const last = await client.query<{ row_hash: string }>(
    `SELECT row_hash FROM audit_logs WHERE row_hash IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1`,
  );
  // The head of the chain is the row nobody points to; use the newest hashed row as the tail.
  let prev: string | null = last.rows[0]?.row_hash ?? null;
  const tail = await chainTail(client);
  if (tail) prev = tail;
  for (const row of loose.rows) {
    const h = hashRow({ ...row, prev_hash: prev });
    await client.query(`UPDATE audit_logs SET prev_hash = $2, row_hash = $3 WHERE id = $1`, [row.id, prev, h]);
    prev = h;
  }
  return loose.rows.length;
}

/** The hash of the row that no other row points to (the end of the chain). */
async function chainTail(client: import("pg").PoolClient): Promise<string | null> {
  const r = await client.query<{ row_hash: string }>(
    `SELECT a.row_hash FROM audit_logs a
      WHERE a.row_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM audit_logs b WHERE b.prev_hash = a.row_hash)
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`,
  );
  return r.rows[0]?.row_hash ?? null;
}

/**
 * Append an audit log entry to the chain. Returns the created row.
 */
export async function createAuditLog(entry: AuditLogEntry) {
  const client = await pool.connect();
  let created: { id: string; created_at: string };
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('audit_logs_chain'))`);
    await sealLegacy(client);
    const prev = await chainTail(client);

    const id = randomUUID();
    const at = new Date();
    // Round-trip through JSON so the hash covers exactly what the database will hold.
    const changes = entry.field_changes ? JSON.parse(JSON.stringify(entry.field_changes)) : null;
    const rowHash = hashRow({
      id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      field_changes: changes,
      user_id: entry.user_id,
      created_at: at,
      prev_hash: prev,
    });
    await client.query(
      `INSERT INTO audit_logs
         (id, action, entity_type, entity_id, field_changes, user_id, ip_address, user_agent, created_at, prev_hash, row_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        changes ? JSON.stringify(changes) : null,
        entry.user_id,
        entry.ip_address ?? null,
        entry.user_agent ?? null,
        at,
        prev,
        rowHash,
      ],
    );
    await client.query("COMMIT");
    created = { id, created_at: at.toISOString() };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await stamp(entry);
  return created;
}

export interface ChainReport {
  ok: boolean;
  total: number;
  sealed: number;
  unsealed: number;
  problems: string[];
}

/** Walk the chain from its first entry and report anything that doesn't add up. */
export async function verifyAuditChain(): Promise<ChainReport> {
  const rows = await query<HashInput & { row_hash: string | null }>(
    `SELECT id, action, entity_type, entity_id, field_changes, user_id, created_at, prev_hash, row_hash
       FROM audit_logs`,
  );
  const sealed = rows.filter((r) => r.row_hash);
  const problems: string[] = [];

  const byPrev = new Map<string, (typeof sealed)[number][]>();
  const heads: (typeof sealed)[number][] = [];
  for (const r of sealed) {
    if (!r.prev_hash) heads.push(r);
    else byPrev.set(r.prev_hash, [...(byPrev.get(r.prev_hash) ?? []), r]);
  }
  if (sealed.length > 0 && heads.length !== 1) {
    problems.push(
      heads.length === 0
        ? "The start of the chain is missing: an early entry was removed or altered."
        : `The chain has ${heads.length} starting points: an entry was removed or inserted.`,
    );
  }

  let visited = 0;
  let current = heads[0];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    visited++;
    if (hashRow(current) !== current.row_hash) {
      problems.push(`Entry ${current.id} (${new Date(current.created_at).toISOString()}) was changed after it was written.`);
      break;
    }
    const next = byPrev.get(current.row_hash as string) ?? [];
    if (next.length > 1) {
      problems.push(`More than one entry follows ${current.id}: an entry was inserted.`);
      break;
    }
    current = next[0];
  }
  if (problems.length === 0 && visited !== sealed.length) {
    problems.push(`${sealed.length - visited} entries are not connected to the chain: some were removed or altered.`);
  }

  return {
    ok: problems.length === 0,
    total: rows.length,
    sealed: sealed.length,
    unsealed: rows.length - sealed.length,
    problems,
  };
}

/**
 * Query audit logs with optional filters.
 */
export async function queryAuditLogs(filters: {
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.entity_type) {
    conditions.push(`entity_type = $${idx++}`);
    params.push(filters.entity_type);
  }
  if (filters.entity_id) {
    conditions.push(`entity_id = $${idx++}`);
    params.push(filters.entity_id);
  }
  if (filters.user_id) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.user_id);
  }
  if (filters.action) {
    conditions.push(`action = $${idx++}`);
    params.push(filters.action);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = await query<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    field_changes: Record<string, unknown> | null;
    user_id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  }>(
    `SELECT id, action, entity_type, entity_id, field_changes, user_id, ip_address, user_agent, created_at
       FROM audit_logs
       ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return rows;
}
