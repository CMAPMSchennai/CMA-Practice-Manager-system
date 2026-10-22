/**
 * Firm-wide automation settings (Gaps #49, #54), kept as one hidden row in
 * reference_data (type 'system_setting', code 'automation') until schema
 * changes are possible again.
 *
 *  recurring_lead_days — how many days before a recurring engagement's period
 *                        ends the next period is created (FR-06, FR-55).
 *  escalation_days     — days before a statutory due date at which the ladder
 *                        moves up a step: assignee, manager, partner-in-charge;
 *                        the Managing Partner is told on the due date (FR-67).
 *  reminder_days       — days after an invoice's due date at which the first,
 *                        second and third payment reminders are drafted (FR-74).
 */
import { query } from "@/lib/db";

export interface AutomationSettings {
  recurring_lead_days: number;
  escalation_days: [number, number, number];
  reminder_days: [number, number, number];
  /** Target days from starting a task to completing it, for the task KPI tiles (FR-53, Gap #64). */
  turnaround_target_days: number;
  /**
   * Gap #83: tasks created from a library get a due date this many days after they are created.
   * 0 means no date is set automatically. The firm sets it (it can be raised when staff are short).
   */
  task_due_days: number;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  recurring_lead_days: 7,
  escalation_days: [7, 3, 1],
  reminder_days: [7, 15, 30],
  turnaround_target_days: 5,
  task_due_days: 15,
};

const CODE = "automation";

function wholeDays(v: unknown, fallback: number, max = 60): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
}

/** Keep stored or submitted values sensible: whole days, escalation steps descending, reminders ascending. */
export function sanitizeAutomation(input: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  const d = DEFAULT_AUTOMATION;
  const lead = wholeDays(input?.recurring_lead_days, d.recurring_lead_days);

  const raw = Array.isArray(input?.escalation_days) ? input!.escalation_days : d.escalation_days;
  const a = wholeDays(raw[0], d.escalation_days[0]);
  const b = Math.min(a, wholeDays(raw[1], d.escalation_days[1]));
  const c = Math.min(b, wholeDays(raw[2], d.escalation_days[2]));

  const rem = Array.isArray(input?.reminder_days) ? input!.reminder_days : d.reminder_days;
  const r1 = wholeDays(rem[0], d.reminder_days[0], 365);
  const r2 = Math.max(r1, wholeDays(rem[1], d.reminder_days[1], 365));
  const r3 = Math.max(r2, wholeDays(rem[2], d.reminder_days[2], 365));

  const target = wholeDays(input?.turnaround_target_days, d.turnaround_target_days, 90);
  return {
    recurring_lead_days: lead,
    escalation_days: [a, b, c],
    reminder_days: [r1, r2, r3],
    turnaround_target_days: target === 0 ? d.turnaround_target_days : target,
    task_due_days: wholeDays(input?.task_due_days, d.task_due_days, 180),
  };
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const rows = await query<{ metadata: Partial<AutomationSettings> | null }>(
    `SELECT metadata FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  return sanitizeAutomation(rows[0]?.metadata);
}

/**
 * Gap #83: the due date a task gets on the day a doer is assigned, as YYYY-MM-DD in Indian time:
 * today plus the firm's "days given to finish a new task". Null when the firm has set 0.
 */
export async function defaultTaskDueDate(): Promise<string | null> {
  const { task_due_days: days } = await getAutomationSettings();
  if (!days || days <= 0) return null;
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export async function saveAutomationSettings(next: AutomationSettings): Promise<AutomationSettings> {
  const clean = sanitizeAutomation(next);
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'Automation settings', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [CODE, JSON.stringify(clean)],
  );
  return clean;
}
