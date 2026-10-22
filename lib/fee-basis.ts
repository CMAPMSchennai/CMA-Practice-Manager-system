/**
 * How an engagement's agreed fee is read (FR-47).
 *
 *   fixed        one amount for the whole engagement
 *   per_month    an amount for each month, for example "₹25,000/mo" for GST + TDS
 *   per_visit    an amount for each visit (stock audit, concurrent audit branch visits)
 *   retainer / hourly / value_based   kept from earlier
 *
 * Reimbursements are billed separately, on the invoice, under the firm's five heads.
 * Safe to import from screens and server code alike.
 */
export const FEE_BASES = [
  { v: "fixed", l: "Fixed fee", unit: "total" },
  { v: "per_month", l: "Per month", unit: "per month" },
  { v: "per_visit", l: "Per visit", unit: "per visit" },
  { v: "retainer", l: "Retainer", unit: "per period" },
  { v: "hourly", l: "Hourly", unit: "per hour" },
  { v: "value_based", l: "Value based", unit: "total" },
] as const;

export function feeBasisLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return FEE_BASES.find((b) => b.v === v.toLowerCase())?.l ?? v.replace(/_/g, " ");
}

export function feeUnit(v: string | null | undefined): string {
  return FEE_BASES.find((b) => b.v === (v ?? "").toLowerCase())?.unit ?? "";
}
