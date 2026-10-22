/**
 * Recurring engagements (FR-06, FR-55).
 *
 * For every recurring engagement series (same client, service and billing
 * entity), when the latest period ends within the lead time (Settings, default
 * 7 days) or has already ended, the next period's engagement is created as a
 * Draft with the same terms, the same team, and its tasks copied from the
 * linked task library. Nothing is created twice for the same period.
 */
import { query, pool } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { getAutomationSettings } from "@/lib/app-settings";
import { nextEngagementCode } from "@/lib/engagement-code";
import { instantiateLibraryOnEngagement } from "@/lib/instantiate-library";

interface SeriesRow {
  id: string;
  engagement_code: string;
  client_id: string;
  client_name: string | null;
  service_type_id: string;
  billing_entity_id: string;
  task_library_id: string | null;
  period_end_s: string;
  fee_basis: string | null;
  agreed_fee: string | null;
  reimbursement_heads: unknown;
  partner_in_charge_id: string | null;
  notes: string | null;
  recurrence_pattern: string | null;
  days_to_end: number;
}

export interface RecurringResult {
  created: { id: string; engagement_code: string; client_name: string | null; period_start: string; period_end: string; tasks_created: number }[];
  not_yet_due: number;
  problems: string[];
}

function monthsFor(pattern: string | null): number | null {
  const p = (pattern ?? "").toLowerCase();
  if (p.includes("month")) return 1;
  if (p.includes("quarter")) return 3;
  if (p.includes("half")) return 6;
  if (p.includes("annu") || p.includes("year")) return 12;
  return null;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

export async function runRecurring(actorId: string): Promise<RecurringResult> {
  const { recurring_lead_days } = await getAutomationSettings();
  const result: RecurringResult = { created: [], not_yet_due: 0, problems: [] };

  const series = await query<SeriesRow>(
    `SELECT DISTINCT ON (e.client_id, e.service_type_id, e.billing_entity_id)
            e.id, e.engagement_code, e.client_id, c.name AS client_name,
            e.service_type_id, e.billing_entity_id, e.task_library_id,
            to_char(e.period_end, 'YYYY-MM-DD') AS period_end_s,
            e.fee_basis, e.agreed_fee, e.reimbursement_heads,
            e.partner_in_charge_id, e.notes, st.recurrence_pattern,
            (e.period_end - CURRENT_DATE)::int AS days_to_end
       FROM engagements e
       JOIN service_types st ON st.id = e.service_type_id
       LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.is_recurring = true AND e.period_end IS NOT NULL AND e.status <> 'cancelled'
      ORDER BY e.client_id, e.service_type_id, e.billing_entity_id, e.period_end DESC`,
  );

  for (const s of series) {
    const months = monthsFor(s.recurrence_pattern);
    if (!months) continue;
    if (s.days_to_end > recurring_lead_days) {
      result.not_yet_due++;
      continue;
    }

    const nextStart = addDays(s.period_end_s, 1);
    const nextEnd = addDays(addMonths(nextStart, months), -1);

    const dup = await query<{ id: string }>(
      `SELECT id FROM engagements
        WHERE client_id = $1 AND service_type_id = $2 AND billing_entity_id = $3
          AND period_start = $4::date LIMIT 1`,
      [s.client_id, s.service_type_id, s.billing_entity_id, nextStart],
    );
    if (dup.length > 0) continue;

    const conn = await pool.connect();
    let newId = "";
    let newCode = "";
    try {
      await conn.query("BEGIN");
      newCode = await nextEngagementCode((sql, params) => conn.query(sql, params));
      const ins = await conn.query(
        `INSERT INTO engagements
           (engagement_code, client_id, service_type_id, billing_entity_id, task_library_id,
            period_start, period_end, fee_basis, agreed_fee, reimbursement_heads,
            partner_in_charge_id, is_recurring, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,'draft')
         RETURNING id`,
        [
          newCode,
          s.client_id,
          s.service_type_id,
          s.billing_entity_id,
          s.task_library_id,
          nextStart,
          nextEnd,
          s.fee_basis,
          s.agreed_fee,
          s.reimbursement_heads ? JSON.stringify(s.reimbursement_heads) : null,
          s.partner_in_charge_id,
          s.notes,
        ],
      );
      newId = ins.rows[0].id as string;
      await conn.query(
        `INSERT INTO engagement_team (engagement_id, user_id, role_in_engagement)
         SELECT $1, user_id, role_in_engagement FROM engagement_team WHERE engagement_id = $2
         ON CONFLICT (engagement_id, user_id) DO NOTHING`,
        [newId, s.id],
      );
      await conn.query("COMMIT");
    } catch (err) {
      await conn.query("ROLLBACK").catch(() => {});
      result.problems.push(`${s.client_name ?? s.client_id}: could not create the next period (${err instanceof Error ? err.message : "error"})`);
      continue;
    } finally {
      conn.release();
    }

    let tasksCreated = 0;
    if (s.task_library_id) {
      try {
        tasksCreated = (await instantiateLibraryOnEngagement(newId, s.task_library_id)).tasks_created;
      } catch (err) {
        result.problems.push(`${newCode}: created without tasks (${err instanceof Error ? err.message : "error"})`);
      }
    }

    await createAuditLog({
      action: "create_engagement",
      entity_type: "engagement",
      entity_id: newId,
      field_changes: {
        engagement_code: { before: null, after: newCode },
        recurring_from: { before: null, after: s.engagement_code },
        period: { before: null, after: `${nextStart} to ${nextEnd}` },
        tasks_created: { before: null, after: tasksCreated },
      },
      user_id: actorId,
    });

    result.created.push({
      id: newId,
      engagement_code: newCode,
      client_name: s.client_name,
      period_start: nextStart,
      period_end: nextEnd,
      tasks_created: tasksCreated,
    });
  }

  return result;
}

let lastRun = 0;

/** Run the recurring check at most every 30 minutes; never lets an error reach the caller. */
export async function maybeRunRecurring(actorId: string): Promise<void> {
  const now = Date.now();
  if (now - lastRun < 30 * 60 * 1000) return;
  lastRun = now;
  try {
    await runRecurring(actorId);
  } catch (err) {
    lastRun = 0;
    console.error("[recurring] check failed:", err);
  }
}
