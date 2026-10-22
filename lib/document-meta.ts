/**
 * Extra facts about a document: its category, who verified it and when, and
 * which expiry alerts have already gone out (FR-63, FR-64).
 *
 * The documents table can't hold these: its document_type column only accepts
 * two old values ('card', 'engagement'), and schema changes are blocked
 * (Dual7 migration 0042). So they live in a hidden reference_data row, type
 * 'record_extra', code 'document:<id>'. A new version of a file is a new
 * document row, so it starts unverified.
 */
import { query } from "@/lib/db";

export interface DocMeta {
  category?: string | null;
  verified_by?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  // Step one (added feature A4): the Manager's check. verified_* above is the Managing Partner's step.
  checked_by?: string | null;
  checked_by_name?: string | null;
  checked_at?: string | null;
  // Optional peer review by a different Managing Partner.
  peer_id?: string | null;
  peer_name?: string | null;
  peer_requested_at?: string | null;
  peer_done_at?: string | null;
  alerted?: number[];
}

const TYPE = "record_extra";

export async function getDocMeta(ids: string[]): Promise<Map<string, DocMeta>> {
  const out = new Map<string, DocMeta>();
  if (ids.length === 0) return out;
  const rows = await query<{ code: string; metadata: DocMeta | null }>(
    `SELECT code, metadata FROM reference_data WHERE type = $1 AND code = ANY($2::text[])`,
    [TYPE, ids.map((id) => `document:${id}`)],
  );
  for (const r of rows) out.set(r.code.slice("document:".length), r.metadata ?? {});
  return out;
}

export async function patchDocMeta(id: string, patch: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ($1, $2, 'Document details', 0, true, $3::jsonb)
     ON CONFLICT (type, code) DO UPDATE
       SET metadata = COALESCE(reference_data.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = now()`,
    [TYPE, `document:${id}`, JSON.stringify(patch)],
  );
}
