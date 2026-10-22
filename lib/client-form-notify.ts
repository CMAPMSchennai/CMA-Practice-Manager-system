/**
 * Tells the right people when a client finishes their onboarding form.
 *
 * Recipients: everyone whose role can onboard clients (Managing Partner,
 * Partners, Admin), the client's partner in charge, and whoever created the
 * link, limited to those who can actually see this client. The alert appears
 * in the notification bell and opens the client's page. A failure here never
 * stops the submission.
 */
import { query } from "@/lib/db";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";

export async function notifyClientFormSubmitted(opts: {
  clientId: string;
  signatory: string;
  serviceCount: number;
  draftCount: number;
  generatedBy: string | null;
}): Promise<number> {
  try {
    const client = await query<{ name: string; client_code: string | null; partner_in_charge_id: string | null }>(
      `SELECT name, client_code, partner_in_charge_id FROM clients WHERE id = $1 LIMIT 1`,
      [opts.clientId],
    );
    if (client.length === 0) return 0;

    const candidates = await query<{ id: string; role: string }>(
      `SELECT u.id, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = true
          AND (r.permissions->>'onboard_clients' = 'true'
               OR u.id = $1::uuid OR u.id = $2::uuid)`,
      [client[0].partner_in_charge_id, opts.generatedBy],
    );

    const recipients: string[] = [];
    for (const c of candidates) {
      try {
        if (await canSeeClient(await getAccessScope(c.id, c.role), opts.clientId)) recipients.push(c.id);
      } catch {
        /* skip anyone whose access can't be worked out */
      }
    }

    const label = client[0].client_code ? `${client[0].name} (${client[0].client_code})` : client[0].name;
    const subject = `${client[0].name} has completed the onboarding form`;
    const body =
      `${label}: submitted by ${opts.signatory}. ` +
      `${opts.serviceCount} service${opts.serviceCount === 1 ? "" : "s"} chosen` +
      (opts.draftCount ? `, ${opts.draftCount} draft engagement${opts.draftCount === 1 ? "" : "s"} created` : "") +
      `. Please review the details and documents.`;
    const data = JSON.stringify({ client_id: opts.clientId, kind: "client_form_submitted" });

    for (const rid of recipients) {
      await query(
        `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
         VALUES ('in_app', $1, 'client_form_submitted', $2, $3, $4::jsonb, 'delivered')`,
        [rid, subject, body, data],
      );
    }
    return recipients.length;
  } catch (err) {
    console.error("[client-form-notify] failed:", err);
    return 0;
  }
}
