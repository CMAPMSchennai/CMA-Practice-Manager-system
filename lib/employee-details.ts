/**
 * The staff onboarding form's extra details (FR-38, FR-39, FR-41).
 *
 * `buildDetailUpdate` turns whatever the form sent into column values, with
 * checks, so the create and edit routes share one set of rules. Last drawn
 * CTC is stored encrypted like salary (FR-04), so it is handled apart from the
 * plain fields. Accepting the confidentiality undertaking is a separate step
 * and, once accepted, is never overwritten.
 */
import { query } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { getUndertakingText } from "@/lib/undertaking";

const TEXT: Record<string, number> = {
  gender: 20,
  blood_group: 10,
  father_guardian_name: 255,
  permanent_address: 1000,
  permanent_pin: 10,
  current_address: 1000,
  current_pin: 10,
  alt_contact: 30,
  personal_email: 255,
  official_email: 255,
  highest_qualification: 100,
  ca_stage_level: 40,
  previous_firm: 255,
  previous_designation: 255,
  notice_period: 50,
  bank_account_holder: 255,
  bank_name: 255,
  bank_branch: 255,
  emergency_name: 255,
  emergency_relationship: 100,
  emergency_mobile: 30,
  authorised_signatory: 255,
};
const DATES = [
  "date_of_birth",
  "itt_date",
  "orientation_date",
  "articleship_registration_date",
  "articleship_exit_date",
  "tenure_from",
  "tenure_to",
];
const YES_NO_NA = ["yes", "no", "na"];
const GENDERS = ["male", "female", "other"];
const EXIT_FORMS = ["none", "form_108", "form_109"];

export class DetailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetailError";
  }
}

export interface Qualification {
  exam: string;
  board: string;
  year: string;
  percentage: string;
}

function clean(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Values to write for the fields present in `body`. Throws DetailError for a bad value. */
export function buildDetailUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [k, max] of Object.entries(TEXT)) {
    if (k in body) out[k] = clean(body[k], max);
  }
  for (const k of DATES) {
    if (k in body) {
      const s = clean(body[k], 10);
      if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new DetailError("Enter dates in full, for example 2026-04-01.");
      out[k] = s;
    }
  }

  if ("gender" in out && out.gender && !GENDERS.includes(String(out.gender).toLowerCase())) {
    throw new DetailError("Gender must be male, female or other.");
  }
  if ("gender" in out && out.gender) out.gender = String(out.gender).toLowerCase();
  for (const k of ["permanent_pin", "current_pin"]) {
    if (out[k] && !/^\d{6}$/.test(String(out[k]))) throw new DetailError("PIN codes must be 6 digits.");
  }
  for (const k of ["personal_email", "official_email"]) {
    if (out[k] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(out[k]))) throw new DetailError("One of the email addresses does not look right.");
  }
  for (const k of ["alt_contact", "emergency_mobile"]) {
    if (out[k] && String(out[k]).replace(/\D/g, "").length < 10) throw new DetailError("Phone numbers need at least 10 digits.");
  }

  for (const k of ["itt_completed", "orientation_completed"]) {
    if (k in body) {
      const s = clean(body[k], 5)?.toLowerCase() ?? null;
      if (s && !YES_NO_NA.includes(s)) throw new DetailError("ITT and Orientation must be yes, no or not applicable.");
      out[k] = s;
    }
  }
  if ("articleship_exit_form" in body) {
    const s = clean(body.articleship_exit_form, 10)?.toLowerCase() ?? null;
    if (s && !EXIT_FORMS.includes(s)) throw new DetailError("Articleship exit form must be none, Form 108 or Form 109.");
    out.articleship_exit_form = s;
  }
  if ("industrial_training" in body) {
    out.industrial_training = body.industrial_training === null || body.industrial_training === "" ? null : body.industrial_training === true || body.industrial_training === "true";
  }

  if ("qualifications" in body) {
    const raw = Array.isArray(body.qualifications) ? body.qualifications : [];
    const rows: Qualification[] = raw
      .slice(0, 20)
      .map((r) => {
        const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
        return {
          exam: clean(o.exam, 100) ?? "",
          board: clean(o.board, 200) ?? "",
          year: clean(o.year, 4) ?? "",
          percentage: clean(o.percentage, 10) ?? "",
        };
      })
      .filter((r) => r.exam || r.board || r.year || r.percentage);
    for (const r of rows) {
      if (r.year && !/^(19|20)\d{2}$/.test(r.year)) throw new DetailError("Year of passing must be a 4-digit year.");
      if (r.percentage && !(Number(r.percentage) >= 0 && Number(r.percentage) <= 100)) throw new DetailError("Percentage must be between 0 and 100.");
    }
    out.qualifications = JSON.stringify(rows);
  }

  if ("last_drawn_ctc" in body) {
    const raw = clean(body.last_drawn_ctc, 20);
    if (raw && !(Number(raw) >= 0)) throw new DetailError("Last drawn CTC must be a number.");
    out.last_drawn_ctc = encryptField(raw);
  }
  return out;
}

/** Apply the checked values to an employee row (and stamp who changed it). */
export async function saveDetailUpdate(employeeId: string, values: Record<string, unknown>, actorId: string): Promise<void> {
  const keys = Object.keys(values);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}${k === "qualifications" ? "::jsonb" : ""}`);
  await query(
    `UPDATE employees SET ${sets.join(", ")}, updated_by = $${keys.length + 1}, updated_at = now() WHERE id = $${keys.length + 2}`,
    [...keys.map((k) => values[k]), actorId, employeeId],
  );
}

/**
 * Record the confidentiality undertaking as accepted, with the time, the
 * typed name, the place and the full text shown (FR-39). Does nothing if it
 * was already accepted.
 */
export async function acceptUndertaking(
  employeeId: string,
  signatory: string,
  place: string,
): Promise<{ accepted: boolean }> {
  const name = signatory.trim();
  if (!name) throw new DetailError("Type the employee's full name to accept the undertaking.");
  const { text } = await getUndertakingText();
  const rows = await query<{ id: string }>(
    `UPDATE employees
        SET confidentiality_undertaking_signed = true,
            undertaking_accepted_at = now(),
            undertaking_signatory = $2,
            undertaking_place = $3,
            undertaking_text = $4,
            updated_at = now()
      WHERE id = $1 AND undertaking_accepted_at IS NULL
      RETURNING id`,
    [employeeId, name.slice(0, 255), place.trim().slice(0, 100) || null, text],
  );
  return { accepted: rows.length > 0 };
}

/** Decrypt the protected CTC for display; null if absent or unreadable. */
export function readCtc(stored: unknown): string | null {
  try {
    const v = decryptField(stored as string | null);
    return v ? String(v) : null;
  } catch {
    return null;
  }
}
