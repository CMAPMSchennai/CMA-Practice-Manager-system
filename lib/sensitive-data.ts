/**
 * Confidential personal data (FR-04, NFR-03).
 *
 * FR-04: salary, CTC, stipend and bank fields are visible only to the Managing
 * Partner, Partners and the designated Admin role (and to the employee for their
 * own record). NFR-03: PAN, Aadhaar and bank numbers are otherwise masked to the
 * last 4 characters.
 */
export const COMPENSATION_ROLES = new Set(["managing_partner", "partner", "admin"]);

export function canViewCompensation(roleName: string | null | undefined): boolean {
  return !!roleName && COMPENSATION_ROLES.has(roleName);
}

/** "ABCDE1234F" → "XXXXXX234F" — keeps the last 4 characters. */
export function maskLast4(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (s.length <= 4) return s;
  return "X".repeat(s.length - 4) + s.slice(-4);
}
