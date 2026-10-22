/**
 * Payment reminders (FR-74; Gap #54).
 *
 * For every overdue invoice a draft reminder is prepared at the intervals set
 * in Settings (default 7, 15 and 30 days after the due date). A Partner or the
 * Managing Partner approves it before it goes to the client. There is no email
 * account yet, so an approved reminder is shown with its wording to send by
 * hand, then marked as sent. Reminders for an invoice that is paid off,
 * cancelled or written off are dismissed automatically.
 *
 * Stored as hidden reference_data rows (type 'invoice_reminder') until schema
 * changes are possible again.
 */
import { query } from "@/lib/db";
import { getAutomationSettings } from "@/lib/app-settings";
import { OPEN_STATUSES, SETTLED_SQL, markOverdueInvoices } from "@/lib/invoice-status";

export type ReminderState = "pending_approval" | "approved" | "sent" | "dismissed";

export interface Reminder {
  id: string;
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  stage: number;
  state: ReminderState;
  outstanding: number;
  due_date: string | null;
  days_overdue: number;
  text: string;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
}

const inr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

function wording(stage: number, client: string, number: string, outstanding: number, due: string, entity: string) {
  const opening =
    stage === 1
      ? "This is a gentle reminder that"
      : stage === 2
        ? "We write again regarding"
        : "This is a final reminder regarding";
  return (
    `Dear ${client},\n\n${opening} invoice ${number}, due on ${due}, with ${inr(outstanding)} still outstanding. ` +
    `Kindly arrange payment at the earliest, or let us know if you have already paid so that we can update our records.\n\n` +
    `Thank you,\n${entity}`
  );
}

/** Prepare any reminders that have come due and dismiss those that no longer apply. */
export async function syncReminders(): Promise<void> {
  await markOverdueInvoices();
  const { reminder_days } = await getAutomationSettings();

  const open = await query<{
    id: string;
    invoice_number: string;
    client_name: string | null;
    entity_name: string | null;
    due: string;
    outstanding: number;
    days: number;
  }>(
    `SELECT i.id, i.invoice_number, c.name AS client_name, e.name AS entity_name,
            to_char(i.due_date, 'YYYY-MM-DD') AS due,
            (i.total_amount::float8 - ${SETTLED_SQL}) AS outstanding,
            (CURRENT_DATE - i.due_date)::int AS days
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN entities e ON e.id = i.billing_entity_id
      WHERE i.status = ANY($1::text[]) AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE`,
    [[...OPEN_STATUSES]],
  );
  const owing = open.filter((i) => i.outstanding > 0.01);

  const existing = await query<{ code: string }>(
    `SELECT code FROM reference_data WHERE type = 'invoice_reminder'`,
  );
  const have = new Set(existing.map((r) => r.code));

  for (const inv of owing) {
    for (let stage = 1; stage <= 3; stage++) {
      const code = `${inv.id}:${stage}`;
      if (have.has(code) || inv.days < reminder_days[stage - 1]) continue;
      const text = wording(
        stage,
        inv.client_name ?? "Sir or Madam",
        inv.invoice_number,
        inv.outstanding,
        inv.due,
        inv.entity_name ?? "Chandramouli & Associates LLP",
      );
      await query(
        `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
         VALUES ('invoice_reminder', $1, $2, $3, true, $4::jsonb)
         ON CONFLICT (type, code) DO NOTHING`,
        [
          code,
          `Reminder ${stage}`,
          stage,
          JSON.stringify({ invoice_id: inv.id, stage, state: "pending_approval", text }),
        ],
      );
    }
  }

  // Dismiss reminders whose invoice is settled, cancelled, written off or no longer overdue.
  await query(
    `UPDATE reference_data rd
        SET metadata = rd.metadata || '{"state":"dismissed","reason":"invoice no longer overdue"}'::jsonb,
            updated_at = now()
      WHERE rd.type = 'invoice_reminder'
        AND rd.metadata ->> 'state' IN ('pending_approval', 'approved')
        AND NOT EXISTS (
          SELECT 1 FROM invoices i
           WHERE i.id = (rd.metadata ->> 'invoice_id')::uuid
             AND i.status = ANY($1::text[])
             AND i.due_date < CURRENT_DATE
             AND (i.total_amount::float8 - ${SETTLED_SQL}) > 0.01
        )`,
    [[...OPEN_STATUSES]],
  );
}

export async function listReminders(): Promise<Reminder[]> {
  const rows = await query<{
    id: string;
    metadata: { invoice_id: string; stage: number; state: ReminderState; text: string; decided_by?: string; decided_at?: string };
    created_at: string;
    invoice_number: string | null;
    client_name: string | null;
    due: string | null;
    outstanding: number | null;
    days: number | null;
    decided_by_name: string | null;
  }>(
    `SELECT rd.id, rd.metadata, rd.created_at,
            i.invoice_number, c.name AS client_name,
            to_char(i.due_date, 'YYYY-MM-DD') AS due,
            (i.total_amount::float8 - ${SETTLED_SQL}) AS outstanding,
            (CURRENT_DATE - i.due_date)::int AS days,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS decided_by_name
       FROM reference_data rd
       JOIN invoices i ON i.id = (rd.metadata ->> 'invoice_id')::uuid
       LEFT JOIN clients c ON c.id = i.client_id
       LEFT JOIN users u ON u.id::text = rd.metadata ->> 'decided_by'
      WHERE rd.type = 'invoice_reminder'
      ORDER BY (rd.metadata ->> 'state' = 'pending_approval') DESC, rd.created_at DESC
      LIMIT 200`,
  );
  return rows.map((r) => ({
    id: r.id,
    invoice_id: r.metadata.invoice_id,
    invoice_number: r.invoice_number ?? "",
    client_name: r.client_name,
    stage: r.metadata.stage,
    state: r.metadata.state,
    outstanding: Math.round((Number(r.outstanding) || 0) * 100) / 100,
    due_date: r.due,
    days_overdue: Math.max(0, Number(r.days) || 0),
    text: r.metadata.text,
    created_at: r.created_at,
    decided_at: r.metadata.decided_at ?? null,
    decided_by_name: r.decided_by_name,
  }));
}

export async function decideReminder(
  id: string,
  next: "approved" | "dismissed" | "sent",
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await query<{ metadata: { state: ReminderState } }>(
    `SELECT metadata FROM reference_data WHERE id = $1 AND type = 'invoice_reminder' LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return { ok: false, error: "Reminder not found." };
  const state = rows[0].metadata.state;
  const allowed =
    (next === "approved" && state === "pending_approval") ||
    (next === "dismissed" && (state === "pending_approval" || state === "approved")) ||
    (next === "sent" && state === "approved");
  if (!allowed) return { ok: false, error: "That isn't possible for a reminder in its current state." };
  await query(
    `UPDATE reference_data
        SET metadata = metadata || $2::jsonb, updated_at = now()
      WHERE id = $1`,
    [id, JSON.stringify({ state: next, decided_by: userId, decided_at: new Date().toISOString() })],
  );
  return { ok: true };
}
