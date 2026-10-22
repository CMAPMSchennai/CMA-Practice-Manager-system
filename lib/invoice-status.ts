/**
 * Invoice lifecycle helpers (FR-70, FR-73).
 *
 *   draft → issued → sent → partially_paid / paid, or overdue once the due date
 *   passes; draft / issued / sent can be cancelled, an open invoice can be
 *   written off. Raised means issued, sent or partially paid and not yet late.
 */
import { query } from "@/lib/db";

export const OPEN_STATUSES = ["issued", "sent", "partially_paid", "overdue"] as const;

/** What has been settled on invoice `i`: money received plus TDS the client deducted. */
export const SETTLED_SQL = `COALESCE((SELECT SUM(r.amount + COALESCE(r.tds_amount, 0))
                                      FROM receipts r WHERE r.invoice_id = i.id), 0)::float8`;

/** An open invoice past its due date becomes Overdue. Safe to run on every read. */
export async function markOverdueInvoices(): Promise<void> {
  await query(
    `UPDATE invoices
        SET status = 'overdue', updated_at = now()
      WHERE status IN ('issued', 'sent', 'partially_paid')
        AND due_date IS NOT NULL AND due_date < CURRENT_DATE`,
  );
}

export function daysOverdue(dueDate: string | null, status: string, outstanding: number): number {
  if (!dueDate || outstanding <= 0.01) return 0;
  if (!(OPEN_STATUSES as readonly string[]).includes(status)) return 0;
  const days = Math.floor((Date.now() - Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return days > 0 ? days : 0;
}
