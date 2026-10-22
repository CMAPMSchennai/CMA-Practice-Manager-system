/**
 * Who may see what, as switches the Managing Partner or Admin can change (Gap #31, added feature).
 * Kept as one hidden row in reference_data (type 'system_setting', code 'visibility').
 *
 *  managers_see_standard_fees — whether a Manager sees the standard fee on the Services list.
 *                               Off by default. Paid Assistants and Articled Clerks never see fees (§4).
 */
import { query } from "@/lib/db";

export interface VisibilitySettings {
  managers_see_standard_fees: boolean;
}

export const DEFAULT_VISIBILITY: VisibilitySettings = { managers_see_standard_fees: false };

const CODE = "visibility";

export async function getVisibilitySettings(): Promise<{ settings: VisibilitySettings; row_id: string | null }> {
  const rows = await query<{ id: string; metadata: Partial<VisibilitySettings> | null }>(
    `SELECT id, metadata FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  return {
    settings: { managers_see_standard_fees: rows[0]?.metadata?.managers_see_standard_fees === true },
    row_id: rows[0]?.id ?? null,
  };
}

export async function saveVisibilitySettings(next: VisibilitySettings): Promise<string> {
  const clean: VisibilitySettings = { managers_see_standard_fees: next.managers_see_standard_fees === true };
  const rows = await query<{ id: string }>(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'Visibility settings', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()
     RETURNING id`,
    [CODE, JSON.stringify(clean)],
  );
  return rows[0].id;
}
