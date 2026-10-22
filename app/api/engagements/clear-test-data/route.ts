/**
 * Clear test data (Gaps #74 and #79, not in the PDF). Managing Partner only. TEST-ONLY:
 * remove this route and its page (Settings > Clear test data) before go-live.
 *
 * GET  ?kind=engagements|invoices|expenses|documents|clients|notifications&q=   lists records to choose from.
 * POST { kind, ids, confirm: "DELETE" }  removes the chosen records. Every removal is audited.
 *   engagements  with their tasks, team and delay reasons (invoices are kept, only unlinked)
 *   invoices     with their receipts and engagement links
 *   expenses
 *   documents    registered document details (no file is stored, see Gap #70)
 *   clients      only when they have no engagements, invoices or receipts left
 * POST { kind: "notifications", confirm: "DELETE" } clears every in-app notification.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool, query } from "@/lib/db";
import { requireRole, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { currentPeriod, recomputeForUsers } from "@/lib/payroll-readiness";

type Kind = "engagements" | "invoices" | "expenses" | "documents" | "clients" | "notifications" | "surnames" | "services";
const KINDS: Kind[] = ["engagements", "invoices", "expenses", "documents", "clients", "notifications", "surnames", "services"];

// Service names that came from the app's own starter list (3 Sept), not from the firm's workbook.
// "Stock Audit" is on the firm's list too and stays.
const OLD_SERVICE_FILTER = `coalesce(description, '') NOT ILIKE 'Category:%' AND lower(trim(name)) <> 'stock audit' AND is_active = true`;

// Staff whose real workbook row has no surname, but who still carry an invented surname from the
// earlier dummy import (the importer never clears a value). Pre-ticked on the Staff surnames tab.
const INVENTED_SURNAME_CODES = [
  "CMA-P01", "CMA-P03", "CMA-P04", "CMA-S01", "CMA-AC05", "CMA-AC06", "CMA-AC07", "CMA-AC09", "CMA-AC10",
  "CMA-AC13", "CMA-AC14", "CMA-AC16", "CMA-AC17", "CMA-AC20", "CMA-PA06", "CMA-PA14", "CMA-PA15", "CMA-PA16", "CMA-PA18",
];

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "managing_partner");
    const sp = req.nextUrl.searchParams;
    const kind = (sp.get("kind") ?? "engagements") as Kind;
    const q = (sp.get("q") ?? "").trim();

    if (kind === "engagements") {
      const rows = await query(
        `SELECT e.id, e.engagement_code AS label, c.name AS client_name, e.status,
                (SELECT COUNT(*)::int FROM task_instances t WHERE t.engagement_id = e.id) AS tasks,
                (SELECT COUNT(*)::int FROM invoice_engagements ie WHERE ie.engagement_id = e.id) AS invoices
           FROM engagements e LEFT JOIN clients c ON c.id = e.client_id
          ORDER BY e.engagement_code`,
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "invoices") {
      const rows = await query(
        `SELECT i.id, i.invoice_number AS label, c.name AS client_name, i.status, i.total_amount::float8 AS amount,
                (SELECT COUNT(*)::int FROM receipts r WHERE r.invoice_id = i.id) AS receipts
           FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
          ORDER BY i.invoice_date DESC, i.invoice_number`,
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "expenses") {
      const rows = await query(
        `SELECT id, COALESCE(NULLIF(trim(category), ''), 'Other') AS label, COALESCE(description, '') AS client_name,
                to_char(expense_date, 'YYYY-MM-DD') AS status, amount::float8 AS amount
           FROM expenses ORDER BY expense_date DESC`,
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "documents") {
      const rows = await query(
        `SELECT id, file_name AS label, owner_type AS client_name, document_type AS status
           FROM documents ORDER BY created_at DESC`,
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "clients") {
      // Clients with activity or entered by hand come first; search reaches every client.
      const rows = await query(
        `SELECT c.id, c.name AS label, c.client_code AS client_name,
                CASE WHEN c.migration_batch_id IS NULL THEN 'entered by hand' ELSE 'from import' END AS status,
                (SELECT COUNT(*)::int FROM engagements e WHERE e.client_id = c.id) AS engagements,
                (SELECT COUNT(*)::int FROM invoices i WHERE i.client_id = c.id) AS invoices,
                (SELECT COUNT(*)::int FROM receipts r WHERE r.client_id = c.id) AS receipts
           FROM clients c
          WHERE ($1 <> '' AND (c.name ILIKE '%' || $1 || '%' OR c.client_code ILIKE '%' || $1 || '%'))
             OR ($1 = '' AND (c.migration_batch_id IS NULL
                  OR EXISTS (SELECT 1 FROM engagements e WHERE e.client_id = c.id)
                  OR EXISTS (SELECT 1 FROM invoices i WHERE i.client_id = c.id)
                  OR EXISTS (SELECT 1 FROM receipts r WHERE r.client_id = c.id)))
          ORDER BY c.name
          LIMIT 100`,
        [q],
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "notifications") {
      const rows = await query(`SELECT COUNT(*)::int AS n FROM notifications`);
      return NextResponse.json({ kind, rows });
    }
    if (kind === "services") {
      const rows = await query(
        `SELECT id, name AS label, code AS client_name, 'starter list' AS status,
                (SELECT COUNT(*)::int FROM engagements e WHERE e.service_type_id = service_types.id) AS engagements
           FROM service_types WHERE ${OLD_SERVICE_FILTER} ORDER BY name`,
      );
      return NextResponse.json({ kind, rows });
    }
    if (kind === "surnames") {
      const rows = await query(
        `SELECT id, employee_id_code || '  ' || first_name AS label, last_name AS client_name,
                CASE WHEN employee_id_code = ANY($1::text[]) THEN 'suggested' ELSE '' END AS status
           FROM employees WHERE last_name IS NOT NULL AND last_name <> ''
          ORDER BY (employee_id_code = ANY($1::text[])) DESC, employee_id_code`,
        [INVENTED_SURNAME_CODES],
      );
      return NextResponse.json({ kind, rows });
    }
    return NextResponse.json({ error: "Unknown kind." }, { status: 422 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  let actorId: string;
  try {
    actorId = (await requireRole(req, "managing_partner")).id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; ids?: unknown; confirm?: string };
  const kind = (body.kind ?? "engagements") as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Unknown kind." }, { status: 422 });
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 422 });

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const ua = req.headers.get("user-agent");
  const audit = (entity_type: string, entity_id: string, label: string) =>
    createAuditLog({
      action: "delete",
      entity_type,
      entity_id,
      field_changes: { record: { before: label, after: null }, via: { before: null, after: "clear test data" } },
      user_id: actorId,
      ip_address: ip,
      user_agent: ua,
    });

  if (kind === "notifications") {
    const gone = await query<{ id: string }>(`DELETE FROM notifications RETURNING id`);
    return NextResponse.json({ deleted: [`${gone.length} notifications`], failed: [] });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Choose at least one record." }, { status: 422 });

  const deleted: string[] = [];
  const failed: { label: string; error: string }[] = [];
  const affected = new Set<string>();

  async function inTx(fn: (c: Awaited<ReturnType<typeof pool.connect>>) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fn(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  if (kind === "services") {
    // Hidden, not deleted: the service list re-seeds itself if it ever drops below 98 rows.
    const found = await query<{ id: string; name: string }>(
      `UPDATE service_types SET is_active = false, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND ${OLD_SERVICE_FILTER} RETURNING id, name`,
      [ids],
    );
    found.forEach((s) => deleted.push(`Hidden: ${s.name}`));
  } else if (kind === "surnames") {
    const found = await query<{ id: string; employee_id_code: string }>(
      `UPDATE employees SET last_name = NULL, updated_at = now(), updated_by = $2, version = version + 1
        WHERE id = ANY($1::uuid[]) RETURNING id, employee_id_code`,
      [ids, actorId],
    );
    found.forEach((e) => deleted.push(`Surname cleared: ${e.employee_id_code}`));
  } else if (kind === "engagements") {
    const found = await query<{ id: string; engagement_code: string }>(
      `SELECT id, engagement_code FROM engagements WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const eng of found) {
      const doers = await query<{ assigned_to: string }>(
        `SELECT DISTINCT assigned_to FROM task_instances WHERE engagement_id = $1 AND assigned_to IS NOT NULL`,
        [eng.id],
      );
      try {
        await inTx(async (c) => {
          await c.query(
            `DELETE FROM delay_reason_dispositions WHERE task_instance_id IN (SELECT id FROM task_instances WHERE engagement_id = $1)`,
            [eng.id],
          );
          await c.query(`DELETE FROM invoice_engagements WHERE engagement_id = $1`, [eng.id]);
          await c.query(`DELETE FROM engagements WHERE id = $1`, [eng.id]);
        });
      } catch (err) {
        console.error("[clear-test-data] engagement", eng.engagement_code, err);
        failed.push({ label: eng.engagement_code, error: "Linked to other records, so it was left in place." });
        continue;
      }
      deleted.push(eng.engagement_code);
      doers.forEach((d) => affected.add(d.assigned_to));
      await audit("engagement", eng.id, eng.engagement_code);
    }
  } else if (kind === "invoices") {
    const found = await query<{ id: string; invoice_number: string }>(
      `SELECT id, invoice_number FROM invoices WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const inv of found) {
      try {
        await inTx(async (c) => {
          await c.query(`DELETE FROM receipts WHERE invoice_id = $1`, [inv.id]);
          await c.query(`DELETE FROM invoices WHERE id = $1`, [inv.id]);
        });
      } catch (err) {
        console.error("[clear-test-data] invoice", inv.invoice_number, err);
        failed.push({ label: inv.invoice_number, error: "Linked to other records, so it was left in place." });
        continue;
      }
      deleted.push(inv.invoice_number);
      await audit("invoice", inv.id, inv.invoice_number);
    }
  } else if (kind === "expenses") {
    const found = await query<{ id: string; category: string }>(
      `SELECT id, COALESCE(NULLIF(trim(category), ''), 'Other') AS category FROM expenses WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const ex of found) {
      try {
        await query(`DELETE FROM expenses WHERE id = $1`, [ex.id]);
      } catch (err) {
        console.error("[clear-test-data] expense", ex.id, err);
        failed.push({ label: ex.category, error: "Linked to other records, so it was left in place." });
        continue;
      }
      deleted.push(`Expense: ${ex.category}`);
      await audit("expense", ex.id, ex.category);
    }
  } else if (kind === "documents") {
    const found = await query<{ id: string; file_name: string }>(
      `SELECT id, file_name FROM documents WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const d of found) {
      try {
        await query(`DELETE FROM documents WHERE id = $1`, [d.id]);
      } catch (err) {
        console.error("[clear-test-data] document", d.id, err);
        failed.push({ label: d.file_name, error: "Linked to other records, so it was left in place." });
        continue;
      }
      deleted.push(d.file_name);
      await audit("document", d.id, d.file_name);
    }
  } else if (kind === "clients") {
    const found = await query<{ id: string; name: string; busy: number }>(
      `SELECT c.id, c.name,
              ((SELECT COUNT(*) FROM engagements e WHERE e.client_id = c.id)
             + (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id)
             + (SELECT COUNT(*) FROM receipts r WHERE r.client_id = c.id))::int AS busy
         FROM clients c WHERE c.id = ANY($1::uuid[])`,
      [ids],
    );
    for (const cl of found) {
      if (cl.busy > 0) {
        failed.push({ label: cl.name, error: "Still has engagements or invoices. Remove those first." });
        continue;
      }
      try {
        await inTx(async (c) => {
          await c.query(`DELETE FROM documents WHERE owner_type = 'client' AND owner_id = $1`, [cl.id]);
          await c.query(`DELETE FROM clients WHERE id = $1`, [cl.id]);
        });
      } catch (err) {
        console.error("[clear-test-data] client", cl.name, err);
        failed.push({ label: cl.name, error: "Linked to other records, so it was left in place." });
        continue;
      }
      deleted.push(cl.name);
      await audit("clients", cl.id, cl.name);
    }
  }

  if (affected.size) {
    try {
      await recomputeForUsers([...affected], [currentPeriod()]);
    } catch (err) {
      console.error("[clear-test-data] payroll recompute failed:", err);
    }
  }
  return NextResponse.json({ deleted, failed });
}
