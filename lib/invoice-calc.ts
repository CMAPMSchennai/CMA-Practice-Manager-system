/**
 * Invoice arithmetic and numbering (FR-71, FR-72; Gaps #51, #52).
 *
 * GST is charged per professional-fee line at that line's rate (0, 5, 12, 18
 * or 28%, default 18%). When the billing entity's GSTIN state matches the
 * place of supply the tax is split into CGST and SGST, otherwise it is IGST.
 * Reimbursements are billed separately and carry no GST.
 *
 * Numbers follow the entity's own series, <ENTITY>/INV-<FY>-<####>, where FY is
 * the last two digits of the year the Indian financial year (April to March)
 * starts in.
 */
import type { PoolClient } from "pg";

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export const DEFAULT_GST_RATE = 18;

/** The firm's five reimbursement heads (FR-47, FR-72). */
export const REIMBURSEMENT_HEADS = ["ROC", "GST fees", "Travel", "Food", "Others"] as const;

export interface FeeLine {
  description: string;
  sac_code?: string;
  amount: number;
  gst_rate?: number;
}

export interface ReimbursementLine {
  head: string;
  description: string;
  amount: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A usable percentage for the arithmetic. Which rates a new invoice may use is a setting
 * (lib/gst-rates.ts, checked when the invoice is saved), so old invoices keep working even
 * if a rate is later taken off the list.
 */
export function isValidRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

export interface InvoiceTotals {
  subtotal: number;
  reimbursement_total: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst_total: number;
  total: number;
}

/** Which GST the invoice charges: IGST, or CGST + SGST. */
export type GstType = "igst" | "cgst_sgst";

export function isGstType(v: unknown): v is GstType {
  return v === "igst" || v === "cgst_sgst";
}

/**
 * `gstType` is the person's choice on the invoice form (default IGST; the form suggests
 * CGST + SGST when the place of supply is the billing entity's own state). When it is not
 * given, the type is worked out from the place of supply as before.
 */
export function computeTotals(
  lines: FeeLine[],
  reimbursements: ReimbursementLine[],
  entityGstin: string | null,
  placeOfSupply: string | null,
  gstType?: GstType | null,
): InvoiceTotals {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const reimbursementTotal = round2(reimbursements.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const tax = lines.reduce(
    (s, l) => s + ((Number(l.amount) || 0) * (isValidRate(l.gst_rate) ? l.gst_rate : DEFAULT_GST_RATE)) / 100,
    0,
  );

  const entityState = entityGstin ? entityGstin.substring(0, 2) : null;
  const supplyState = placeOfSupply ? placeOfSupply.substring(0, 2) : null;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const sameState = gstType === "cgst_sgst" ? true : gstType === "igst" ? false : !!(entityState && supplyState && entityState === supplyState);
  if (sameState) {
    cgst = round2(tax / 2);
    sgst = round2(tax / 2);
  } else {
    igst = round2(tax);
  }
  const gst = round2(cgst + sgst + igst);
  return {
    subtotal,
    reimbursement_total: reimbursementTotal,
    cgst,
    sgst,
    igst,
    gst_total: gst,
    total: round2(subtotal + reimbursementTotal + gst),
  };
}

/** Last two digits of the year the Indian financial year containing this date starts in. */
export function financialYearCode(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return String(start % 100).padStart(2, "0");
}

/**
 * Next number in the entity's series for the invoice date's financial year.
 * Must run inside the transaction that inserts the invoice; the lock stops two
 * invoices raised at the same moment from getting the same number.
 */
export async function nextInvoiceNumber(
  client: PoolClient,
  entityId: string,
  shortCode: string,
  invoiceDate: string,
): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`invoice_no:${entityId}`]);
  const fy = financialYearCode(invoiceDate);
  const esc = shortCode.replace(/[^A-Za-z0-9]/g, "\\$&");
  const res = await client.query<{ max_num: number | null }>(
    `SELECT MAX(substring(invoice_number FROM $1)::int) AS max_num
       FROM invoices WHERE billing_entity_id = $3 AND invoice_number ~ $2`,
    [`^${esc}/INV-${fy}-([0-9]+)$`, `^${esc}/INV-${fy}-[0-9]+$`, entityId],
  );
  const next = (res.rows[0]?.max_num ?? 0) + 1;
  return `${shortCode}/INV-${fy}-${String(next).padStart(4, "0")}`;
}
