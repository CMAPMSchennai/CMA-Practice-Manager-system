/**
 * The confidentiality undertaking shown on the staff onboarding form (FR-39).
 *
 * The firm's own wording is not in the requirements document, so until the
 * Managing Partner enters it (Settings > Security) a clearly marked
 * placeholder is shown. Whatever text was on screen when a person accepted is
 * copied onto their employee record with the time of acceptance.
 */
import { query } from "@/lib/db";

const CODE = "confidentiality_undertaking";

export const PLACEHOLDER_UNDERTAKING =
  "[PLACEHOLDER: the firm's confidentiality undertaking has not been entered yet. " +
  "The Managing Partner can enter the full text under Settings > Security.] " +
  "I undertake to keep confidential all information about the firm and its clients that I learn during my engagement, " +
  "and not to disclose or misuse it, during or after my engagement.";

export async function getUndertakingText(): Promise<{ text: string; is_placeholder: boolean }> {
  const rows = await query<{ metadata: { text?: string } | null }>(
    `SELECT metadata FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  const t = rows[0]?.metadata?.text;
  return typeof t === "string" && t.trim() ? { text: t, is_placeholder: false } : { text: PLACEHOLDER_UNDERTAKING, is_placeholder: true };
}

export async function saveUndertakingText(text: string): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'Confidentiality undertaking', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [CODE, JSON.stringify({ text: text.trim() })],
  );
}
