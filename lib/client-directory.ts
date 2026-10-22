/**
 * Client directory helpers (FR-25 to FR-27).
 *
 * The PDF names the filter tabs (All, Companies, Banks/PSB, Individuals,
 * Trust/LLP) but not which entity types belong to each. Mapping used (Gap #59,
 * built as a default for confirmation):
 *   Companies   Private Limited, Public Limited, OPC, Subsidiary of Foreign Company
 *   Individuals Individual, Proprietor, HUF
 *   Trust / LLP Trust, Society, LLP, Partnership Firm
 * Banks / PSB waits for the firm (Gap #57). Other types show under All only.
 */
export type DirectoryTab = "all" | "companies" | "individuals" | "trust_llp";

const COMPANIES = ["private_limited", "public_limited", "opc", "foreign_subsidiary"];
const INDIVIDUALS = ["individual", "proprietor", "huf"];
const TRUST_LLP = ["trust", "society", "llp", "partnership_firm"];

export function tabOfEntityType(code: string | null): Exclude<DirectoryTab, "all"> | "other" {
  if (!code) return "other";
  if (COMPANIES.includes(code)) return "companies";
  if (INDIVIDUALS.includes(code)) return "individuals";
  if (TRUST_LLP.includes(code)) return "trust_llp";
  return "other";
}

/** The workbook has no city column, only a free-text address; the last part is usually the area. */
export function areaOfAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
