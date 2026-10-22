/**
 * Client onboarding checklist (FR-34, FR-35, FR-36; Gap #27).
 *
 * Nine items, exactly as approved in the prototype. Progress is shown as n/9
 * and a client cannot be moved to Activated until every item is complete. The
 * Managing Partner may override an item with a written reason, which is
 * recorded.
 *   - "Partner-in-charge assigned" is worked out from the client record.
 *   - "Conflict-of-interest check passed" is set only when a Partner records
 *     the result (with their name and the date).
 *   - The other seven are ticked by hand.
 */
import { query } from "@/lib/db";

export const CLIENT_CHECKLIST = [
  { code: "cert_incorporation", label: "Certificate of Incorporation" },
  { code: "moa_aoa_deed", label: "MoA & AoA / LLP deed" },
  { code: "entity_pan_card", label: "Entity PAN card" },
  { code: "gst_certificate", label: "GST registration certificate" },
  { code: "kyc_signatories", label: "KYC/ID proof of signatories" },
  { code: "cancelled_cheque", label: "Cancelled cheque/bank details" },
  { code: "conflict_check_passed", label: "Conflict-of-interest check passed" },
  { code: "partner_assigned", label: "Partner-in-charge assigned" },
  { code: "engagement_letter_signed", label: "Engagement letter signed & activated" },
] as const;

export const CONFLICT_CODE = "conflict_check_passed";
export const PARTNER_CODE = "partner_assigned";
export const MANUAL_CODES: string[] = CLIENT_CHECKLIST.map((i) => i.code).filter(
  (c) => c !== CONFLICT_CODE && c !== PARTNER_CODE,
);

export function checklistLabel(code: string): string | null {
  return CLIENT_CHECKLIST.find((i) => i.code === code)?.label ?? null;
}

export interface ChecklistRow {
  checklist_item_code: string;
  label: string;
  is_complete: boolean;
  kind: "manual" | "auto" | "conflict";
  completed_at: string | null;
  completed_by_name: string | null;
  notes: string | null;
  override_justification: string | null;
}

/** Makes sure the nine rows exist for this client, then returns them in order. */
export async function getChecklist(clientId: string): Promise<ChecklistRow[]> {
  await query(
    `INSERT INTO onboarding_checklist_items (owner_type, owner_id, checklist_item_code, label, is_complete)
     SELECT 'client', $1, c.code, c.label, false
       FROM unnest($2::text[], $3::text[]) AS c(code, label)
     ON CONFLICT (owner_type, owner_id, checklist_item_code) DO NOTHING`,
    [clientId, CLIENT_CHECKLIST.map((i) => i.code), CLIENT_CHECKLIST.map((i) => i.label)],
  );

  const rows = await query<{
    checklist_item_code: string;
    is_complete: boolean;
    completed_at: string | null;
    completed_by_name: string | null;
    notes: string | null;
    override_justification: string | null;
  }>(
    `SELECT o.checklist_item_code, o.is_complete, o.completed_at, o.notes, o.override_justification,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS completed_by_name
       FROM onboarding_checklist_items o
       LEFT JOIN users u ON u.id = o.completed_by
      WHERE o.owner_type = 'client' AND o.owner_id = $1 AND o.checklist_item_code = ANY($2::text[])`,
    [clientId, CLIENT_CHECKLIST.map((i) => i.code)],
  );
  const byCode = new Map(rows.map((r) => [r.checklist_item_code, r]));

  const client = await query<{ partner_in_charge_id: string | null }>(
    `SELECT partner_in_charge_id FROM clients WHERE id = $1 LIMIT 1`,
    [clientId],
  );
  const hasPartner = !!client[0]?.partner_in_charge_id;

  return CLIENT_CHECKLIST.map((item) => {
    const r = byCode.get(item.code);
    const kind = item.code === PARTNER_CODE ? "auto" : item.code === CONFLICT_CODE ? "conflict" : "manual";
    return {
      checklist_item_code: item.code,
      label: item.label,
      is_complete: item.code === PARTNER_CODE ? hasPartner || !!r?.is_complete : !!r?.is_complete,
      kind,
      completed_at: r?.completed_at ?? null,
      completed_by_name: r?.completed_by_name ?? null,
      notes: r?.notes ?? null,
      override_justification: r?.override_justification ?? null,
    } as ChecklistRow;
  });
}

/** Labels of the items still open, for the activation gate (FR-36). */
export async function openItems(clientId: string): Promise<string[]> {
  return (await getChecklist(clientId)).filter((i) => !i.is_complete).map((i) => i.label);
}
