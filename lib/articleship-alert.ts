/**
 * Articleship-ending alerts (FR-41, added feature).
 *
 * An active articled clerk whose expected completion date is close alerts through
 * the notification bell twice: within 60 days, and again within 14 days (also once the
 * date has passed). Each stage is sent once per clerk. Who is told: the Managing Partner
 * and Admin, who handle the ICAI paperwork.
 *
 * Runs when notifications are fetched (at most every 30 minutes).
 */
import { query } from "@/lib/db";

interface Ending {
  id: string;
  name: string;
  end_s: string;
  days_left: number;
}

export async function runArticleshipAlerts(): Promise<{ notified: number }> {
  const clerks = await query<Ending>(
    `SELECT e.id,
            trim(e.first_name || ' ' || COALESCE(e.last_name, '')) AS name,
            to_char(e.articleship_end_date, 'YYYY-MM-DD') AS end_s,
            (e.articleship_end_date - CURRENT_DATE)::int AS days_left
       FROM employees e
      WHERE e.status = 'active'
        AND e.articleship_end_date IS NOT NULL
        AND e.articleship_exit_date IS NULL
        AND e.articleship_end_date <= CURRENT_DATE + 60`,
  );
  if (clerks.length === 0) return { notified: 0 };

  const recipients = (
    await query<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name IN ('managing_partner', 'admin') AND u.is_active = true`,
    )
  ).map((r) => r.id);
  if (recipients.length === 0) return { notified: 0 };

  let notified = 0;
  for (const c of clerks) {
    const stage = c.days_left <= 14 ? 14 : 60;
    const already = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications
        WHERE template = 'articleship_ending'
          AND data ->> 'employee_id' = $1 AND (data ->> 'stage')::int = $2`,
      [c.id, stage],
    );
    if (parseInt(already[0]?.n ?? "0", 10) > 0) continue;

    const when =
      c.days_left < 0
        ? `was due to finish on ${c.end_s}`
        : c.days_left === 0
          ? `is due to finish today (${c.end_s})`
          : `is due to finish on ${c.end_s}, in ${c.days_left} day${c.days_left === 1 ? "" : "s"}`;
    for (const rid of recipients) {
      await query(
        `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
         VALUES ('in_app', $1, 'articleship_ending', $2, $3, $4::jsonb, 'delivered')`,
        [
          rid,
          `${c.name}'s articleship is ending`,
          `${c.name}'s articleship ${when}. Check the termination or completion form and the ICAI steps.`,
          JSON.stringify({ employee_id: c.id, stage }),
        ],
      );
      notified++;
    }
  }
  return { notified };
}

let lastRun = 0;

/** Run the check at most every 30 minutes; never lets an error reach the caller. */
export async function maybeRunArticleshipAlerts(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < 30 * 60 * 1000) return;
  lastRun = now;
  try {
    await runArticleshipAlerts();
  } catch (err) {
    lastRun = 0;
    console.error("[articleship-alert] check failed:", err);
  }
}
