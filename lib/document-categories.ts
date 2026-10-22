/**
 * Document categories (DM-10, FR-63; Gap C4, accepted by the firm 16 Oct 2026).
 *
 * The PDF sorts every document into one of seven categories. Staff still choose the specific
 * document type when they upload; the category is filled in from a list kept in Settings
 * (reference data of type "document_type", the category in its metadata). The Managing
 * Partner or Admin can add types and move them between categories. A type that is not in
 * the list falls under "Other".
 *
 * Client-safe pieces first (the list and the starting types); the database helpers are below.
 */
export const DOCUMENT_CATEGORIES = [
  "KYC",
  "Banking",
  "Statutory",
  "Working Paper",
  "Engagement Letter",
  "Academic",
  "Other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** The types the upload box has always offered, with the grouping suggested to the firm. */
export const DEFAULT_DOCUMENT_TYPES: { label: string; category: DocumentCategory }[] = [
  { label: "PAN Card", category: "KYC" },
  { label: "GSTIN Certificate", category: "KYC" },
  { label: "Incorporation Certificate", category: "KYC" },
  { label: "Partnership Deed", category: "KYC" },
  { label: "Trust Deed", category: "KYC" },
  { label: "KYC — Identity Proof", category: "KYC" },
  { label: "KYC — Address Proof", category: "KYC" },
  { label: "Bank Statement", category: "Banking" },
  { label: "Engagement Letter", category: "Engagement Letter" },
  { label: "Board Resolution", category: "Statutory" },
  { label: "Form 26AS", category: "Statutory" },
  { label: "Balance Sheet", category: "Working Paper" },
  { label: "IT Return", category: "Statutory" },
  { label: "Academic Certificate", category: "Academic" },
  { label: "Other", category: "Other" },
];

export function isCategory(v: unknown): v is DocumentCategory {
  return typeof v === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(v);
}
