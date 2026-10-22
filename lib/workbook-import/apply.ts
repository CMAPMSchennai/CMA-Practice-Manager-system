/**
 * FR-83 import and rollback.
 *
 * Applies a plan from buildImportPlan(): creates new employees (partners first,
 * §11.2) and clients, applies changes to existing records only where the MP /
 * Admin approved them (Gap #41), and creates held-back duplicates only where
 * approved (§11.3). Every created row carries the batch id; every updated row
 * gets a snapshot, so the whole batch can be rolled back.
 *
 * Batches are recorded in reference_data (type 'import_batch', code = batch id).
 */
import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { syncEmployeeChecklistNow } from "@/lib/employee-checklist";
import {
  getSecureMetaRaw,
  prepareClientPan,
  prepareEmployeeSecrets,
  restoreSecureMeta,
  saveClientSecretMeta,
  saveEmployeeSecretMeta,
  clearSecureMeta,
} from "@/lib/secure-fields";
import { deleteExtras, getExtras, putExtras, type RecordExtras } from "@/lib/record-extras";
import type { ImportPlan, PlanItem } from "@/lib/workbook-import/plan";

export const IMPORT_BATCH_TYPE = "import_batch";

const EMPLOYEE_COLUMNS = [
  "first_name", "last_name", "phone", "position_type", "status", "date_of_joining",
  "payroll_entity_id", "bank_ifsc", "icai_registration_no",
] as const;
const CLIENT_COLUMNS = [
  "entity_type_id", "address", "city", "state", "pin", "contact_person", "contact_email", "contact_phone",
  "gstin", "partner_in_charge_id", "notes",
] as const;

interface UpdateSnapshot {
  kind: "employee" | "client";
  id: string;
  name: string;
  columns: Record<string, unknown>;
  secure_meta: Record<string, unknown> | null;
  extras: RecordExtras | null;
  added_scope_ids?: string[];
}

export interface BatchMeta {
  status: "in_progress" | "applied" | "rolled_back";
  file_name: string;
  imported_by: string;
  imported_at: string;
  created: { employees: string[]; clients: string[] };
  updates: UpdateSnapshot[];
  counts: Record<string, number>;
  errors: { name: string; row: number; sheet: string; error: string }[];
  rolled_back_at?: string;
  rolled_back_by?: string;
  rollback_kept?: { name: string; reason: string }[];
}

async function saveBatch(id: string, label: string, meta: BatchMeta): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, $3, 0, true, $4::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [IMPORT_BATCH_TYPE, id, label.slice(0, 255), JSON.stringify(meta)],
  );
}

export async function getBatch(id: string): Promise<BatchMeta | null> {
  const rows = await query<{ metadata: BatchMeta }>(
    `SELECT metadata FROM reference_data WHERE type = $1 AND code = $2 LIMIT 1`,
    [IMPORT_BATCH_TYPE, id],
  );
  return rows[0]?.metadata ?? null;
}

export async function listBatches(limit = 25) {
  const rows = await query<{ code: string; metadata: BatchMeta; created_at: string }>(
    `SELECT code, metadata, created_at FROM reference_data
      WHERE type = $1 ORDER BY created_at DESC LIMIT $2`,
    [IMPORT_BATCH_TYPE, limit],
  );
  const userIds = [...new Set(rows.flatMap((r) => [r.metadata.imported_by, r.metadata.rolled_back_by]).filter(Boolean))] as string[];
  const users = userIds.length
    ? await query<{ id: string; name: string | null; email: string | null }>(
        `SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])`,
        [userIds],
      )
    : [];
  const who = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));
  return rows.map((r) => ({
    id: r.code,
    status: r.metadata.status,
    file_name: r.metadata.file_name,
    imported_by: who.get(r.metadata.imported_by) ?? "Unknown",
    imported_at: r.metadata.imported_at,
    counts: r.metadata.counts,
    error_count: r.metadata.errors?.length ?? 0,
    rolled_back_at: r.metadata.rolled_back_at ?? null,
    rolled_back_by: r.metadata.rolled_back_by ? who.get(r.metadata.rolled_back_by) ?? "Unknown" : null,
    rollback_kept: r.metadata.rollback_kept ?? [],
  }));
}

async function nextClientCode(): Promise<string> {
  const rows = await query<{ max_num: number | null }>(
    `SELECT MAX(substring(client_code FROM '^CLI-([0-9]+)$')::int) AS max_num
       FROM clients WHERE client_code ~ '^CLI-[0-9]+$'`,
  );
  return `CLI-${String((rows[0]?.max_num ?? 0) + 1).padStart(4, "0")}`;
}

function message(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return "Unknown error";
}

/* ------------------------------------------------------------------ */
/*  Apply                                                             */
/* ------------------------------------------------------------------ */

export interface Approvals {
  /** Keys of updates the MP / Admin approved (Gap #41). */
  updates: Set<string>;
  /** Keys of held-back duplicates approved for import as separate clients (§11.3). */
  duplicates: Set<string>;
}

export async function applyPlan(plan: ImportPlan, approvals: Approvals, actorId: string, fileName: string) {
  const batchId = randomUUID();
  const meta: BatchMeta = {
    status: "in_progress",
    file_name: fileName,
    imported_by: actorId,
    imported_at: new Date().toISOString(),
    created: { employees: [], clients: [] },
    updates: [],
    counts: { employees_created: 0, employees_updated: 0, clients_created: 0, clients_updated: 0, services_linked: 0 },
    errors: [],
  };
  await saveBatch(batchId, fileName, meta);

  const fail = (i: PlanItem, err: unknown) =>
    meta.errors.push({ name: i.name, row: i.row, sheet: i.sheet, error: message(err) });

  // §11.2: employees before clients, partners first.
  const employees = [...plan.employees].sort((a, b) =>
    (a.employee?.columns.position_type === "partner" ? 0 : 1) - (b.employee?.columns.position_type === "partner" ? 0 : 1),
  );

  for (const item of employees) {
    const p = item.employee;
    if (!p) continue;
    try {
      if (item.action === "create") {
        const secrets = await prepareEmployeeSecrets(p.secrets);
        const c = p.columns;
        const rows = await query<{ id: string }>(
          `INSERT INTO employees (
             employee_id_code, first_name, last_name, phone, position_type, payroll_entity_id,
             date_of_joining, salary, pan, aadhaar, bank_account_no, bank_ifsc, icai_registration_no,
             confidentiality_undertaking_signed, status, migration_batch_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,$12,false,$13,$14)
           RETURNING id`,
          [c.employee_id_code, c.first_name, c.last_name, c.phone, c.position_type, c.payroll_entity_id,
            c.date_of_joining, secrets.columns.pan ?? null, secrets.columns.aadhaar ?? null,
            secrets.columns.bank_account_no ?? null, c.bank_ifsc, c.icai_registration_no, c.status, batchId],
        );
        const id = rows[0].id;
        meta.created.employees.push(id);
        await saveEmployeeSecretMeta(id, secrets.meta);
        await putExtras("employee", id, p.extras);
        await syncEmployeeChecklistNow(id);
        meta.counts.employees_created++;
      } else if (item.action === "update" && item.existing_id && approvals.updates.has(item.key)) {
        const id = item.existing_id;
        const before = await query<Record<string, unknown>>(
          `SELECT ${[...EMPLOYEE_COLUMNS, "pan", "aadhaar", "bank_account_no", "salary"].join(", ")}
             FROM employees WHERE id = $1`,
          [id],
        );
        const snapshot: UpdateSnapshot = {
          kind: "employee",
          id,
          name: item.name,
          columns: before[0] ?? {},
          secure_meta: await getSecureMetaRaw("employee", id),
          extras: await getExtras("employee", id),
        };
        const secrets = await prepareEmployeeSecrets(p.secrets, id);
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const col of EMPLOYEE_COLUMNS) {
          const v = p.columns[col];
          if (v !== null) {
            sets.push(`${col} = $${values.length + 1}`);
            values.push(v);
          }
        }
        for (const [col, v] of Object.entries(secrets.columns)) {
          if (col === "salary" || v === undefined) continue;
          sets.push(`${col} = $${values.length + 1}`);
          values.push(v);
        }
        if ("salary" in p.secrets) sets.push("salary = NULL");
        sets.push("version = version + 1", "updated_at = now()");
        values.push(id);
        meta.updates.push(snapshot);
        await query(`UPDATE employees SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
        await saveEmployeeSecretMeta(id, secrets.meta);
        const merged: RecordExtras = {
          ...(snapshot.extras ?? { fields: {} }),
          ...p.extras,
          fields: { ...(snapshot.extras?.fields ?? {}), ...p.extras.fields },
        };
        await putExtras("employee", id, merged);
        meta.counts.employees_updated++;
      }
    } catch (err) {
      fail(item, err);
    }
  }

  for (const item of plan.clients) {
    const p = item.client;
    if (!p) continue;
    const create = item.action === "create" || (item.action === "review" && approvals.duplicates.has(item.key));
    try {
      if (create) {
        const pan = await prepareClientPan(p.pan);
        const c = p.columns;
        const rows = await query<{ id: string }>(
          `INSERT INTO clients (
             client_code, name, entity_type_id, pan, gstin, address, city, state, pin, contact_person,
             contact_email, contact_phone, partner_in_charge_id, onboarding_status, notes, migration_batch_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'imported',$14,$15)
           RETURNING id`,
          [await nextClientCode(), c.name, c.entity_type_id, pan.column, c.gstin, c.address, c.city, c.state, c.pin,
            c.contact_person, c.contact_email, c.contact_phone, c.partner_in_charge_id, c.notes, batchId],
        );
        const id = rows[0].id;
        meta.created.clients.push(id);
        await saveClientSecretMeta(id, pan.meta);
        await putExtras("client", id, p.extras);
        for (const sid of p.scope_service_ids) {
          await query(
            `INSERT INTO client_service_scope (client_id, service_type_id) VALUES ($1, $2)
             ON CONFLICT (client_id, service_type_id) DO NOTHING`,
            [id, sid],
          );
          meta.counts.services_linked++;
        }
        meta.counts.clients_created++;
      } else if (item.action === "update" && item.existing_id && approvals.updates.has(item.key)) {
        const id = item.existing_id;
        const before = await query<Record<string, unknown>>(
          `SELECT ${[...CLIENT_COLUMNS, "pan"].join(", ")} FROM clients WHERE id = $1`,
          [id],
        );
        const currentScope = await query<{ service_type_id: string }>(
          `SELECT service_type_id FROM client_service_scope WHERE client_id = $1`,
          [id],
        );
        const have = new Set(currentScope.map((s) => s.service_type_id));
        const added = p.scope_service_ids.filter((s) => !have.has(s));
        const snapshot: UpdateSnapshot = {
          kind: "client",
          id,
          name: item.name,
          columns: before[0] ?? {},
          secure_meta: await getSecureMetaRaw("client", id),
          extras: await getExtras("client", id),
          added_scope_ids: added,
        };
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const col of CLIENT_COLUMNS) {
          const v = p.columns[col];
          if (v !== null) {
            sets.push(`${col} = $${values.length + 1}`);
            values.push(v);
          }
        }
        let panMeta: Record<string, unknown> | null = null;
        if (p.pan) {
          const pan = await prepareClientPan(p.pan);
          sets.push(`pan = $${values.length + 1}`);
          values.push(pan.column);
          panMeta = pan.meta;
        }
        sets.push("updated_at = now()");
        values.push(id);
        meta.updates.push(snapshot);
        await query(`UPDATE clients SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
        if (panMeta) await saveClientSecretMeta(id, panMeta);
        for (const sid of added) {
          await query(
            `INSERT INTO client_service_scope (client_id, service_type_id) VALUES ($1, $2)
             ON CONFLICT (client_id, service_type_id) DO NOTHING`,
            [id, sid],
          );
          meta.counts.services_linked++;
        }
        const merged: RecordExtras = {
          ...(snapshot.extras ?? { fields: {} }),
          ...p.extras,
          name_as_imported: snapshot.extras?.name_as_imported ?? p.extras.name_as_imported,
          profile_incomplete: (snapshot.extras?.profile_incomplete ?? false) && p.extras.profile_incomplete,
          fields: { ...(snapshot.extras?.fields ?? {}), ...p.extras.fields },
        };
        await putExtras("client", id, merged);
        meta.counts.clients_updated++;
      }
    } catch (err) {
      fail(item, err);
    }
  }

  meta.status = "applied";
  await saveBatch(batchId, fileName, meta);
  return { batch_id: batchId, counts: meta.counts, errors: meta.errors };
}

/* ------------------------------------------------------------------ */
/*  Rollback                                                          */
/* ------------------------------------------------------------------ */

export async function rollbackBatch(batchId: string, actorId: string) {
  const meta = await getBatch(batchId);
  if (!meta) throw Object.assign(new Error("Import batch not found"), { status: 404 });
  if (meta.status === "rolled_back") throw Object.assign(new Error("This import has already been rolled back"), { status: 409 });

  const kept: { name: string; reason: string }[] = [];

  // Undo updates, newest first.
  for (const s of [...meta.updates].reverse()) {
    try {
      const cols = Object.keys(s.columns);
      if (cols.length) {
        const sets = cols.map((c, i) => `${c} = $${i + 1}`);
        await query(
          `UPDATE ${s.kind === "employee" ? "employees" : "clients"} SET ${sets.join(", ")}, updated_at = now()
            WHERE id = $${cols.length + 1}`,
          [...cols.map((c) => s.columns[c]), s.id],
        );
      }
      await restoreSecureMeta(s.kind, s.id, s.secure_meta as never);
      if (s.extras) await putExtras(s.kind, s.id, s.extras);
      else await deleteExtras(s.kind, s.id);
      for (const sid of s.added_scope_ids ?? []) {
        await query(`DELETE FROM client_service_scope WHERE client_id = $1 AND service_type_id = $2`, [s.id, sid]);
      }
    } catch (err) {
      kept.push({ name: s.name, reason: `Couldn't restore earlier values: ${message(err)}` });
    }
  }

  // Remove created clients (their service links go with them).
  for (const id of meta.created.clients) {
    try {
      const rows = await query<{ name: string }>(
        `DELETE FROM clients WHERE id = $1 AND migration_batch_id = $2 RETURNING name`,
        [id, batchId],
      );
      if (rows.length) {
        await deleteExtras("client", id);
        await clearSecureMeta("client", id);
      }
    } catch {
      const n = await query<{ name: string }>(`SELECT name FROM clients WHERE id = $1`, [id]);
      kept.push({ name: n[0]?.name ?? id, reason: "Client is already in use (e.g. has engagements) — kept" });
    }
  }

  // Remove created employees, unless a login was created for them meanwhile.
  for (const id of meta.created.employees) {
    try {
      const linked = await query<{ name: string; in_use: boolean }>(
        `SELECT trim(concat_ws(' ', e.first_name, e.last_name)) AS name,
                (e.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)) AS in_use
           FROM employees e WHERE e.id = $1`,
        [id],
      );
      if (!linked.length) continue;
      if (linked[0].in_use) {
        kept.push({ name: linked[0].name, reason: "A login has been created for this employee — kept" });
        continue;
      }
      await query(`DELETE FROM onboarding_checklist_items WHERE owner_type = 'employee' AND owner_id = $1`, [id]);
      await query(`DELETE FROM employees WHERE id = $1 AND migration_batch_id = $2`, [id, batchId]);
      await deleteExtras("employee", id);
      await clearSecureMeta("employee", id);
    } catch (err) {
      kept.push({ name: id, reason: `Couldn't remove: ${message(err)}` });
    }
  }

  meta.status = "rolled_back";
  meta.rolled_back_at = new Date().toISOString();
  meta.rolled_back_by = actorId;
  meta.rollback_kept = kept;
  await saveBatch(batchId, meta.file_name, meta);
  return { kept };
}
