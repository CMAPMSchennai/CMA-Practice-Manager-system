/**
 * Which email address a new login uses (pilot decision, 21 Oct 2026).
 *
 * The official email wins. While the firm has not given official emails, the
 * personal email is used instead: first the Personal email field, then the
 * "Personal Email ID" the workbook import kept under imported details.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginAddress = { email: string; source: "official" | "personal" } | null;

function pick(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return EMAIL_SHAPE.test(s) ? s : "";
}

export function loginAddressFor(opts: {
  email?: string | null;
  personal_email?: string | null;
  imported_personal_email?: string | null;
}): LoginAddress {
  const official = pick(opts.email);
  if (official) return { email: official, source: "official" };
  const personal = pick(opts.personal_email) || pick(opts.imported_personal_email);
  if (personal) return { email: personal, source: "personal" };
  return null;
}
