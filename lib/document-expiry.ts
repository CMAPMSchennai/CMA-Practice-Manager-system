/**
 * Expiry alerts for documents (FR-64).
 *
 * A document with an expiry date alerts through the notification bell three
 * times: 30 days before, 7 days before, and on or after the day it expires.
 * Each stage is sent once. Who is told: the person who uploaded it, the
 * partner in charge of the client or engagement (the Managing Partner for
 * staff documents), and the Managing Partner as well once it has expired.
 *
 * Runs when notifications are fetched (at most every 30 minutes).
 */
import { query } from "@/lib/db";
import { getDocMeta, patchDocMeta } from "@/lib/document-meta";

interface DueDoc {
  id: string;
  file_name: string;
  owner_type: string;
  owner_id: string;
  uploaded_by: string | null;
  expiry_s: string;
  days_left: number;
  owner_label: string | null;
  partner_id: string | null;
}

export interface ExpiryResult {
  notified: number;
}

export async function runDocumentExpiry(): Promise<ExpiryResult> {
  const docs = await query<DueDoc>(
    `SELECT d.id, d.file_name, d.owner_type, d.owner_id, d.uploaded_by,
            to_char(d.expiry_date, 'YYYY-MM-DD') AS expiry_s,
            (d.expiry_date - CURRENT_DATE)::int AS days_left,
            CASE d.owner_type
              WHEN 'client' THEN (SELECT c.name FROM clients c WHERE c.id = d.owner_id)
              WHEN 'engagement' THEN (SELECT e.engagement_code FROM engagements e WHERE e.id = d.owner_id)
              WHEN 'employee' THEN (SELECT trim(e.first_name || ' ' || COALESCE(e.last_name, '')) FROM employees e WHERE e.id = d.owner_id)
              WHEN 'entity' THEN (SELECT en.name FROM entities en WHERE en.id = d.owner_id)
            END AS owner_label,
            CASE d.owner_type
              WHEN 'client' THEN (SELECT c.partner_in_charge_id FROM clients c WHERE c.id = d.owner_id)
              WHEN 'engagement' THEN (SELECT e.partner_in_charge_id FROM engagements e WHERE e.id = d.owner_id)
            END AS partner_id
       FROM documents d
      WHERE d.is_active = true AND d.expiry_date IS NOT NULL AND d.expiry_date <= CURRENT_DATE + 30`,
  );
  if (docs.length === 0) return { notified: 0 };

  const mps = (
    await query<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'managing_partner' AND u.is_active = true`,
    )
  ).map((r) => r.id);

  const meta = await getDocMeta(docs.map((d) => d.id));
  let notified = 0;

  for (const d of docs) {
    const stage = d.days_left <= 0 ? 0 : d.days_left <= 7 ? 7 : 30;
    const sent = meta.get(d.id)?.alerted ?? [];
    if (sent.includes(stage)) continue;

    const recipients = new Set<string>();
    if (d.uploaded_by) recipients.add(d.uploaded_by);
    if (d.partner_id) recipients.add(d.partner_id);
    if (d.owner_type === "employee" || d.owner_type === "entity" || stage === 0 || recipients.size === 0) mps.forEach((m) => recipients.add(m));

    const about = d.owner_label ? ` (${d.owner_label})` : "";
    const when =
      d.days_left < 0
        ? `expired on ${d.expiry_s}`
        : d.days_left === 0
          ? `expires today (${d.expiry_s})`
          : `expires on ${d.expiry_s}, in ${d.days_left} day${d.days_left === 1 ? "" : "s"}`;
    const subject = stage === 0 ? `${d.file_name} has expired` : `${d.file_name} expires soon`;

    for (const rid of recipients) {
      await query(
        `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
         VALUES ('in_app', $1, 'document_expiry', $2, $3, $4::jsonb, 'delivered')`,
        [
          rid,
          subject,
          `${d.file_name}${about} ${when}. Upload a renewed copy to the Document Vault.`,
          JSON.stringify({ document_id: d.id, owner_type: d.owner_type, owner_id: d.owner_id, stage }),
        ],
      );
      notified++;
    }
    await patchDocMeta(d.id, { alerted: [...sent, stage] });
  }
  return { notified };
}

let lastRun = 0;

/** Run the expiry check at most every 30 minutes; never lets an error reach the caller. */
export async function maybeRunDocumentExpiry(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < 30 * 60 * 1000) return;
  lastRun = now;
  try {
    await runDocumentExpiry();
  } catch (err) {
    lastRun = 0;
    console.error("[document-expiry] check failed:", err);
  }
}
