/**
 * Escalation ladder for statutory due dates (FR-67).
 *
 * As a due date approaches, the person told moves up a step:
 *   level 1  the owner (assignee)
 *   level 2  the engagement manager
 *   level 3  the partner-in-charge
 *   level 4  the Managing Partner, from the due date onwards
 * Days before the due date for levels 1 to 3 come from Settings (default 7, 3, 1).
 *
 * The check runs when the compliance calendar is opened (at most every 15
 * minutes) and when a partner presses "Check escalations". Each step notifies
 * once; the level only ever goes up.
 */
import { query } from "@/lib/db";
import { getAutomationSettings } from "@/lib/app-settings";

interface OpenItem {
  id: string;
  client_id: string;
  client_name: string | null;
  obligation_name: string;
  due_date_s: string;
  days_left: number;
  escalation_level: number;
  owner_id: string | null;
  partner_in_charge_id: string | null;
}

export interface EscalationResult {
  marked_overdue: number;
  escalated: number;
  notified: number;
}

const LEVEL_WORDS: Record<number, string> = {
  1: "is coming up",
  2: "is getting close",
  3: "is due very soon",
  4: "is due",
};

async function usersWithRole(role: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = $1 AND u.is_active = true`,
    [role],
  );
  return rows.map((r) => r.id);
}

async function managersOnClient(clientId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT DISTINCT u.id
       FROM engagement_team et
       JOIN engagements e ON e.id = et.engagement_id
       JOIN users u ON u.id = et.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE e.client_id = $1 AND r.name = 'manager' AND u.is_active = true`,
    [clientId],
  );
  return rows.map((r) => r.id);
}

export async function runEscalation(): Promise<EscalationResult> {
  const { escalation_days } = await getAutomationSettings();
  const [d1, d2, d3] = escalation_days;

  // Past due and still open: mark overdue.
  const overdue = await query<{ id: string }>(
    `UPDATE statutory_due_dates
        SET status = 'overdue', updated_at = now()
      WHERE status IN ('pending','in_progress') AND due_date < CURRENT_DATE
      RETURNING id`,
  );

  const items = await query<OpenItem>(
    `SELECT sd.id, sd.client_id, c.name AS client_name, sd.obligation_name,
            to_char(sd.due_date, 'YYYY-MM-DD') AS due_date_s,
            (sd.due_date - CURRENT_DATE)::int AS days_left,
            sd.escalation_level, sd.owner_id, c.partner_in_charge_id
       FROM statutory_due_dates sd
       JOIN clients c ON c.id = sd.client_id
      WHERE sd.status IN ('pending','in_progress','overdue')
        AND sd.due_date <= CURRENT_DATE + $1::int`,
    [d1],
  );

  const mps = await usersWithRole("managing_partner");
  let escalated = 0;
  let notified = 0;

  for (const it of items) {
    const level = it.days_left <= 0 ? 4 : it.days_left <= d3 ? 3 : it.days_left <= d2 ? 2 : 1;
    if (level <= it.escalation_level) continue;

    let recipients: string[] = [];
    if (level === 1) recipients = [it.owner_id ?? it.partner_in_charge_id ?? ""].filter(Boolean);
    else if (level === 2) {
      const managers = await managersOnClient(it.client_id);
      recipients = managers.length ? managers : [it.partner_in_charge_id ?? ""].filter(Boolean);
    } else if (level === 3) recipients = [it.partner_in_charge_id ?? ""].filter(Boolean);
    else recipients = mps;
    if (recipients.length === 0) recipients = mps; // nobody named: the Managing Partner hears

    await query(
      `UPDATE statutory_due_dates SET escalation_level = $2, updated_at = now() WHERE id = $1`,
      [it.id, level],
    );
    escalated++;

    const when =
      it.days_left > 0
        ? `due ${it.due_date_s} (${it.days_left} day${it.days_left === 1 ? "" : "s"} left)`
        : it.days_left === 0
          ? `due today (${it.due_date_s})`
          : `overdue since ${it.due_date_s}`;
    for (const rid of new Set(recipients)) {
      await query(
        `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
         VALUES ('in_app', $1, 'statutory_escalation', $2, $3, $4::jsonb, 'delivered')`,
        [
          rid,
          `${it.obligation_name} ${LEVEL_WORDS[level]}`,
          `${it.client_name ?? "A client"}: ${it.obligation_name}, ${when}.`,
          JSON.stringify({ statutory_due_date_id: it.id, level }),
        ],
      );
      notified++;
    }
  }

  return { marked_overdue: overdue.length, escalated, notified };
}

let lastRun = 0;

/** Run the escalation check at most every 15 minutes; never lets an error reach the caller. */
export async function maybeRunEscalation(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < 15 * 60 * 1000) return;
  lastRun = now;
  try {
    await runEscalation();
  } catch (err) {
    lastRun = 0;
    console.error("[escalation] check failed:", err);
  }
}
