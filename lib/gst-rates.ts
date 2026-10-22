/**
 * The GST rates an invoice line may use, as a list the Managing Partner or Admin can change
 * (added feature, build 16 Oct). Kept as one hidden row in reference_data
 * (type 'system_setting', code 'gst_rates'), the same way the visibility switches are.
 *
 *   rates         the allowed percentages, for example [0, 5, 12, 18, 28]
 *   default_rate  the rate a new fee line starts with; always one of the list
 *
 * Invoices already raised keep the rate they were raised with, even if it is removed later.
 */
import { query } from "@/lib/db";

export interface GstRateSettings {
  rates: number[];
  default_rate: number;
}

export const STANDARD_GST_RATES = [0, 5, 12, 18, 28];
export const STANDARD_DEFAULT_RATE = 18;
export const MAX_GST_RATES = 15;

const CODE = "gst_rates";

/** One percentage: 0 to 100, at most two decimal places. */
export function cleanRate(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) return null;
  const r = Math.round(n * 100) / 100;
  return Math.abs(r - n) < 1e-9 ? r : null;
}

export function normaliseSettings(input: { rates?: unknown; default_rate?: unknown }): { ok: true; value: GstRateSettings } | { ok: false; error: string } {
  if (!Array.isArray(input.rates) || input.rates.length === 0) {
    return { ok: false, error: "Keep at least one GST rate in the list." };
  }
  const seen = new Set<number>();
  for (const raw of input.rates) {
    const r = cleanRate(raw);
    if (r === null) return { ok: false, error: `"${String(raw)}" is not a valid rate. Use a number from 0 to 100 with at most two decimals.` };
    seen.add(r);
  }
  const rates = [...seen].sort((a, b) => a - b);
  if (rates.length > MAX_GST_RATES) return { ok: false, error: `Keep the list to ${MAX_GST_RATES} rates or fewer.` };
  const def = cleanRate(input.default_rate);
  if (def === null || !rates.includes(def)) {
    return { ok: false, error: "The default rate must be one of the rates in the list." };
  }
  return { ok: true, value: { rates, default_rate: def } };
}

export async function getGstRateSettings(): Promise<GstRateSettings> {
  const rows = await query<{ metadata: Partial<GstRateSettings> | null }>(
    `SELECT metadata FROM reference_data WHERE type = 'system_setting' AND code = $1 LIMIT 1`,
    [CODE],
  );
  const parsed = normaliseSettings({ rates: rows[0]?.metadata?.rates, default_rate: rows[0]?.metadata?.default_rate });
  return parsed.ok ? parsed.value : { rates: STANDARD_GST_RATES, default_rate: STANDARD_DEFAULT_RATE };
}

export async function saveGstRateSettings(next: GstRateSettings): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', $1, 'GST rates', 0, false, $2::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [CODE, JSON.stringify(next)],
  );
}
