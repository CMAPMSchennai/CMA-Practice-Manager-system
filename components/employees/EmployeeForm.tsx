"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Staff onboarding form (FR-38, FR-39, FR-41). Ten sections as in the PDF; filled in
 * by Admin. Used to add a new person (create) and to complete or correct their
 * details later (edit). Conditional sections follow FR-05.
 */

export interface Qual {
  exam: string;
  board: string;
  year: string;
  percentage: string;
}

export interface EmployeeFormProps {
  mode?: "create" | "edit";
  employeeId?: string;
  /** Existing values (edit): the employee record as returned by the API. */
  initial?: Record<string, unknown>;
  /** In edit, whether the viewer may see and change pay and ID fields. */
  payVisible?: boolean;
  onSuccess?: (employee: { id: string; employee_id_code: string }) => void;
  onCancel?: () => void;
}

interface Entity {
  id: string;
  name: string;
  short_code: string;
}
interface Partner {
  id: string;
  name: string;
}

const POSITIONS = [
  { v: "partner", l: "Partner" },
  { v: "paid_assistant", l: "Paid Assistant" },
  { v: "articled_clerk", l: "Articled Clerk" },
  { v: "support_staff", l: "Support Staff" },
];
const STATUSES = [
  { v: "active", l: "Active" },
  { v: "on_leave", l: "On leave" },
  { v: "resigned", l: "Resigned" },
  { v: "terminated", l: "Terminated" },
];
const EXAMS = ["Class X", "Class XII", "Graduation", "CA Foundation", "CA Inter Group I", "CA Inter Group II", "Other / PG / CS / CMA"];
const CA_STAGES = ["Not applicable", "CA Foundation", "CA Inter (Group I)", "CA Inter (Group II)", "CA Final"];
const SRN_PREFIXES = ["UXL", "WRO", "SRO", "ERO", "CRO", "NRO"];
const YES_NO_NA = [
  { v: "yes", l: "Yes" },
  { v: "no", l: "No" },
  { v: "na", l: "Not applicable" },
];

const baseField =
  "flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const okBorder = "border-input";
const badBorder = "border-red-500 ring-1 ring-red-500";

/** Field ids shown in the "fix these" bar, in form order. */
const LABELS: Record<string, string> = {
  first_name: "First name",
  payroll_entity_id: "Payroll entity",
  phone: "Mobile",
  alt_contact: "Alternate contact",
  personal_email: "Personal email",
  permanent_pin: "Permanent PIN",
  current_pin: "Current PIN",
  pan: "PAN",
  aadhaar: "Aadhaar",
  icai_registration_no: "ICAI SRN",
  articleship_start_date: "Articleship start",
  quals: "Qualifications",
  itt_completed: "ITT status",
  itt_date: "ITT date",
  orientation_completed: "Orientation status",
  orientation_date: "Orientation date",
  bank_ifsc: "IFSC",
  emergency_mobile: "Emergency mobile",
  undertaking_name: "Name for the undertaking",
  undertaking: "Undertaking",
  email: "Official email",
  salary: "Salary / stipend",
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");

function addYears(iso: string, years: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1); // three years ends the day before the third anniversary
  return dt.toISOString().slice(0, 10);
}

function Section({ n, title, desc, bad, children }: { n: number; title: string; desc?: string; bad?: number; children: React.ReactNode }) {
  return (
    <Card className={bad ? "border-red-500" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
          {title}
          {bad ? <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">{bad} to fix</span> : null}
        </CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={error ? "text-red-700 dark:text-red-400" : undefined}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-400">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const Opt = ({ value, children }: { value: string; children: React.ReactNode }) => (
  <option value={value} className="bg-background text-foreground">
    {children}
  </option>
);

export function EmployeeForm({ mode = "create", employeeId, initial, payVisible = true, onSuccess, onCancel }: EmployeeFormProps) {
  const edit = mode === "edit";
  const init = initial ?? {};

  const [entities, setEntities] = useState<Entity[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [undertakingText, setUndertakingText] = useState<{ text: string; is_placeholder: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const alreadyAccepted = !!init.undertaking_accepted_at;
  /** Acceptance is offered only once the firm's real wording is in; the placeholder is never accepted. */
  const canAccept = !alreadyAccepted && !!undertakingText && !undertakingText.is_placeholder;

  const [v, setV] = useState<Record<string, string>>(() => ({
    position_type: s(init.position_type) || "paid_assistant",
    designation: s(init.designation),
    date_of_joining: d10(init.date_of_joining),
    payroll_entity_id: s(init.payroll_entity_id),
    status: s(init.status) || "active",
    date_of_leaving: d10(init.date_of_leaving),
    first_name: s(init.first_name),
    last_name: s(init.last_name),
    date_of_birth: d10(init.date_of_birth),
    gender: s(init.gender),
    blood_group: s(init.blood_group),
    father_guardian_name: s(init.father_guardian_name),
    phone: s(init.phone),
    alt_contact: s(init.alt_contact),
    personal_email: s(init.personal_email),
    permanent_address: s(init.permanent_address),
    permanent_pin: s(init.permanent_pin),
    current_address: s(init.current_address),
    current_pin: s(init.current_pin),
    pan: s(init.pan),
    aadhaar: s(init.aadhaar),
    icai_membership_no: s(init.icai_membership_no),
    icai_registration_no: s(init.icai_registration_no),
    articleship_registration_date: d10(init.articleship_registration_date),
    articleship_start_date: d10(init.articleship_start_date),
    articleship_end_date: d10(init.articleship_end_date),
    industrial_training: init.industrial_training === true ? "yes" : init.industrial_training === false ? "no" : "",
    articleship_exit_form: s(init.articleship_exit_form) || "none",
    articleship_exit_date: d10(init.articleship_exit_date),
    highest_qualification: s(init.highest_qualification),
    ca_stage_level: s(init.ca_stage_level),
    itt_completed: s(init.itt_completed),
    itt_date: d10(init.itt_date),
    orientation_completed: s(init.orientation_completed),
    orientation_date: d10(init.orientation_date),
    previous_firm: s(init.previous_firm),
    previous_designation: s(init.previous_designation),
    tenure_from: d10(init.tenure_from),
    tenure_to: d10(init.tenure_to),
    last_drawn_ctc: s(init.last_drawn_ctc),
    notice_period: s(init.notice_period),
    bank_account_holder: s(init.bank_account_holder),
    bank_name: s(init.bank_name),
    bank_branch: s(init.bank_branch),
    bank_account_no: s(init.bank_account_no),
    bank_ifsc: s(init.bank_ifsc),
    emergency_name: s(init.emergency_name),
    emergency_relationship: s(init.emergency_relationship),
    emergency_mobile: s(init.emergency_mobile),
    assigned_mentor_partner_id: s(init.assigned_mentor_partner_id),
    email: s(init.email),
    salary: s(init.salary),
    authorised_signatory: s(init.authorised_signatory),
    undertaking_name: "",
    undertaking_place: "",
  }));
  const [quals, setQuals] = useState<Qual[]>(() => {
    const raw = init.qualifications;
    return Array.isArray(raw) ? (raw as Qual[]).map((r) => ({ exam: s(r.exam), board: s(r.board), year: s(r.year), percentage: s(r.percentage) })) : [];
  });
  const [accepted, setAccepted] = useState(false);

  const articled = v.position_type === "articled_clerk";
  const partnerType = v.position_type === "partner";
  const paidStaff = v.position_type === "paid_assistant" || v.position_type === "support_staff";

  const cls = (id: string) => `${baseField} ${errors[id] ? badBorder : okBorder}`;
  const clearError = (id: string) =>
    setErrors((p) => {
      if (!p[id]) return p;
      const n = { ...p };
      delete n[id];
      return n;
    });
  const set = (k: string, val: string) => {
    setV((p) => ({ ...p, [k]: val }));
    clearError(k);
  };

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((data) => setEntities(Array.isArray(data?.entities) ? data.entities : []))
      .catch(() => toast.error("Failed to load entities"));
    fetch("/api/employees/mentors")
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((d: { partners?: Partner[] }) => setPartners(d.partners ?? []))
      .catch(() => {});
    fetch("/api/settings/undertaking")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text: string; is_placeholder: boolean } | null) => setUndertakingText(d))
      .catch(() => {});
  }, []);

  // Three years from the articleship start is the expected completion; filled in until someone sets it themselves.
  useEffect(() => {
    if (!articled || !v.articleship_start_date || v.articleship_end_date) return;
    const end = addYears(v.articleship_start_date, 3);
    if (end) setV((p) => ({ ...p, articleship_end_date: end }));
  }, [articled, v.articleship_start_date, v.articleship_end_date]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phone10 = (x: string) => x.replace(/\D/g, "").length >= 10;
    if (!v.first_name.trim()) e.first_name = "Enter the first name.";
    if (!v.payroll_entity_id) e.payroll_entity_id = "Choose the payroll entity.";
    if (v.phone && !phone10(v.phone)) e.phone = "Enter at least 10 digits.";
    if (v.alt_contact && !phone10(v.alt_contact)) e.alt_contact = "Enter at least 10 digits.";
    if (v.personal_email && !email.test(v.personal_email)) e.personal_email = "This email doesn't look right.";
    if (v.email && !email.test(v.email)) e.email = "This email doesn't look right.";
    for (const k of ["permanent_pin", "current_pin"]) if (v[k] && !/^\d{6}$/.test(v[k])) e[k] = "PIN codes have 6 digits.";
    const panChanged = !edit || v.pan !== s(init.pan);
    if (v.pan && panChanged && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan.toUpperCase().replace(/\s/g, ""))) e.pan = "PAN looks like ABCDE1234F.";
    const aadChanged = !edit || v.aadhaar !== s(init.aadhaar);
    if (v.aadhaar && aadChanged && !/^\d{12}$/.test(v.aadhaar.replace(/[\s-]/g, ""))) e.aadhaar = "Aadhaar has 12 digits.";
    if (v.bank_ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v.bank_ifsc.trim())) e.bank_ifsc = "IFSC has 11 characters, like SBIN0001234.";
    if (v.emergency_mobile && !phone10(v.emergency_mobile)) e.emergency_mobile = "Enter at least 10 digits.";
    if (v.salary && !(Number(v.salary) >= 0)) e.salary = "Enter a number.";
    if (articled) {
      const srnChanged = !edit || v.icai_registration_no !== s(init.icai_registration_no);
      const srn = v.icai_registration_no.trim().toUpperCase();
      // The firm's CMA students have no ICAI SRN (reply of 21 Oct 2026), so it is optional;
      // when one is typed it must still look right.
      if (srn && srnChanged && !SRN_PREFIXES.some((p) => srn.startsWith(p))) e.icai_registration_no = `SRN starts with ${SRN_PREFIXES.join(", ")}.`;
      if (!v.articleship_start_date) e.articleship_start_date = "Enter the articleship start date.";
      if (!v.itt_completed) e.itt_completed = "Choose Yes, No or Not applicable.";
      else if (v.itt_completed === "yes" && !v.itt_date) e.itt_date = "Enter the ITT completion date.";
      if (!v.orientation_completed) e.orientation_completed = "Choose Yes, No or Not applicable.";
      else if (v.orientation_completed === "yes" && !v.orientation_date) e.orientation_date = "Enter the Orientation completion date.";
    }
    for (const q of quals) {
      if (q.year && !/^(19|20)\d{2}$/.test(q.year)) e.quals = "Year of passing must be a 4-digit year.";
      else if (q.percentage && !(Number(q.percentage) >= 0 && Number(q.percentage) <= 100)) e.quals = "Percentage must be between 0 and 100.";
    }
    if (canAccept) {
      const wants = !edit || accepted || v.undertaking_name.trim();
      if (wants) {
        if (!v.undertaking_name.trim()) e.undertaking_name = "Type the employee's full name to accept.";
        if (!accepted) e.undertaking = "The employee must accept the undertaking.";
      }
    }
    return e;
  }

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => (el as HTMLElement).focus?.({ preventScroll: true }), 350);
  }
  const count = (ids: string[]) => ids.filter((i) => errors[i]).length;
  const errorIds = Object.keys(LABELS).filter((k) => errors[k]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate();
    setErrors(found);
    const first = Object.keys(LABELS).find((k) => found[k]);
    if (first) {
      toast.error(`${Object.keys(found).length} thing${Object.keys(found).length === 1 ? "" : "s"} to fix. Highlighted in red.`);
      jumpTo(first);
      return;
    }

    const body: Record<string, unknown> = {
      position_type: v.position_type,
      designation: v.designation,
      date_of_joining: v.date_of_joining,
      payroll_entity_id: v.payroll_entity_id,
      first_name: v.first_name.trim(),
      last_name: v.last_name,
      phone: v.phone,
      email: v.email,
      alt_contact: v.alt_contact,
      personal_email: v.personal_email,
      date_of_birth: v.date_of_birth,
      gender: v.gender,
      blood_group: v.blood_group,
      father_guardian_name: v.father_guardian_name,
      permanent_address: v.permanent_address,
      permanent_pin: v.permanent_pin,
      current_address: v.current_address,
      current_pin: v.current_pin,
      highest_qualification: v.highest_qualification,
      ca_stage_level: v.ca_stage_level,
      qualifications: quals,
      bank_account_holder: v.bank_account_holder,
      bank_name: v.bank_name,
      bank_branch: v.bank_branch,
      emergency_name: v.emergency_name,
      emergency_relationship: v.emergency_relationship,
      emergency_mobile: v.emergency_mobile,
      assigned_mentor_partner_id: v.assigned_mentor_partner_id || null,
      authorised_signatory: v.authorised_signatory,
    };
    if (articled) {
      Object.assign(body, {
        icai_registration_no: v.icai_registration_no.trim().toUpperCase(),
        articleship_registration_date: v.articleship_registration_date,
        articleship_start_date: v.articleship_start_date,
        articleship_end_date: v.articleship_end_date,
        industrial_training: v.industrial_training === "" ? null : v.industrial_training === "yes",
        articleship_exit_form: v.articleship_exit_form,
        articleship_exit_date: v.articleship_exit_date,
        itt_completed: v.itt_completed,
        itt_date: v.itt_completed === "yes" ? v.itt_date : "",
        orientation_completed: v.orientation_completed,
        orientation_date: v.orientation_completed === "yes" ? v.orientation_date : "",
      });
    }
    if (partnerType) body.icai_membership_no = v.icai_membership_no;
    if (paidStaff) {
      Object.assign(body, {
        previous_firm: v.previous_firm,
        previous_designation: v.previous_designation,
        tenure_from: v.tenure_from,
        tenure_to: v.tenure_to,
        notice_period: v.notice_period,
      });
    }
    // Pay and ID fields: sent on create; in edit only when changed, so masked values are never written back.
    const secretKeys = ["pan", "aadhaar", "bank_account_no", "bank_ifsc", "salary", ...(paidStaff ? ["last_drawn_ctc"] : [])];
    for (const k of secretKeys) {
      if (!edit || v[k] !== s(init[k])) {
        body[k] = k === "pan" ? v[k].toUpperCase().replace(/\s/g, "") : v[k] || null;
      }
    }
    if (edit) {
      body.status = v.status;
      body.date_of_leaving = v.date_of_leaving || null;
    }
    if (canAccept && accepted && v.undertaking_name.trim()) {
      body.accept_undertaking = { signatory: v.undertaking_name.trim(), place: v.undertaking_place };
    }

    setSubmitting(true);
    try {
      const res = await fetch(edit ? `/api/employees/${employeeId}` : "/api/employees", {
        method: edit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Could not save the employee.";
        setServerError(msg);
        toast.error(msg);
        return;
      }
      const emp = json.employee as { id: string; employee_id_code: string };
      toast.success(edit ? "Details saved." : `Employee created. ID: ${emp.employee_id_code}`);
      onSuccess?.(emp);
    } catch {
      setServerError("Could not save the employee. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = (id: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input id={id} className={cls(id)} value={v[id] ?? ""} onChange={(e) => set(id, e.target.value)} {...extra} />
  );
  const sel = (id: string, options: { v: string; l: string }[], blank?: string, disabled?: boolean) => (
    <select id={id} className={cls(id)} value={v[id] ?? ""} onChange={(e) => set(id, e.target.value)} disabled={disabled}>
      {blank !== undefined && <Opt value="">{blank}</Opt>}
      {options.map((o) => (
        <Opt key={o.v} value={o.v}>
          {o.l}
        </Opt>
      ))}
    </select>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {errorIds.length > 0 && (
        <div role="alert" className="sticky top-2 z-20 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900 shadow-md dark:bg-red-950 dark:text-red-100">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {errorIds.length} thing{errorIds.length === 1 ? "" : "s"} still to fix. Tap one to jump to it:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {errorIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => jumpTo(id)}
                className="rounded-full border border-red-600 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100 dark:bg-red-900 dark:text-red-100"
              >
                {LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}

      <Section n={1} title="Position type" bad={count(["payroll_entity_id"])}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="position_type" label="Position type" required hint={edit ? "Changing this changes which sections and documents apply." : undefined}>
            {sel("position_type", POSITIONS)}
          </Field>
          <Field id="designation" label="Designation">
            {input("designation")}
          </Field>
          <Field id="payroll_entity_id" label="Payroll entity" required error={errors.payroll_entity_id}>
            <select id="payroll_entity_id" className={cls("payroll_entity_id")} value={v.payroll_entity_id} onChange={(e) => set("payroll_entity_id", e.target.value)}>
              <Opt value="">{entities.length ? "Select entity…" : "Loading…"}</Opt>
              {entities.map((en) => (
                <Opt key={en.id} value={en.id}>
                  {en.name} ({en.short_code})
                </Opt>
              ))}
            </select>
          </Field>
          <Field id="date_of_joining" label="Date of joining">
            {input("date_of_joining", { type: "date" })}
          </Field>
          {edit && (
            <>
              <Field id="status" label="Employment status">
                {sel("status", STATUSES)}
              </Field>
              {v.status !== "active" && (
                <Field id="date_of_leaving" label="Date of leaving">
                  {input("date_of_leaving", { type: "date" })}
                </Field>
              )}
            </>
          )}
        </div>
      </Section>

      <Section n={2} title="Personal details" bad={count(["first_name", "phone", "alt_contact", "personal_email", "permanent_pin", "current_pin"])}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="first_name" label="First name (as per PAN / Aadhaar)" required error={errors.first_name}>
            {input("first_name")}
          </Field>
          <Field id="last_name" label="Last name">
            {input("last_name")}
          </Field>
          <Field id="date_of_birth" label="Date of birth">
            {input("date_of_birth", { type: "date" })}
          </Field>
          <Field id="gender" label="Gender">
            {sel("gender", [{ v: "male", l: "Male" }, { v: "female", l: "Female" }, { v: "other", l: "Other" }], "Select…")}
          </Field>
          <Field id="blood_group" label="Blood group">
            {sel("blood_group", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ v: b, l: b })), "Select…")}
          </Field>
          <Field id="father_guardian_name" label="Father / guardian name">
            {input("father_guardian_name")}
          </Field>
          <Field id="phone" label="Mobile" error={errors.phone}>
            {input("phone", { placeholder: "+91 XXXXX XXXXX" })}
          </Field>
          <Field id="alt_contact" label="Alternate contact" error={errors.alt_contact}>
            {input("alt_contact")}
          </Field>
          <Field id="personal_email" label="Personal email" error={errors.personal_email}>
            {input("personal_email", { type: "email" })}
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Field id="permanent_address" label="Permanent address">
              <textarea id="permanent_address" rows={2} className={`${baseField} h-auto min-h-16 ${okBorder}`} value={v.permanent_address} onChange={(e) => set("permanent_address", e.target.value)} />
            </Field>
          </div>
          <Field id="permanent_pin" label="PIN" error={errors.permanent_pin}>
            {input("permanent_pin", { inputMode: "numeric", maxLength: 6 })}
          </Field>
          <div className="md:col-span-2">
            <Field id="current_address" label="Current address">
              <textarea id="current_address" rows={2} className={`${baseField} h-auto min-h-16 ${okBorder}`} value={v.current_address} onChange={(e) => set("current_address", e.target.value)} />
            </Field>
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline"
              onClick={() => setV((p) => ({ ...p, current_address: p.permanent_address, current_pin: p.permanent_pin }))}
            >
              Same as permanent address
            </button>
          </div>
          <Field id="current_pin" label="PIN" error={errors.current_pin}>
            {input("current_pin", { inputMode: "numeric", maxLength: 6 })}
          </Field>
        </div>
      </Section>

      <Section
        n={3}
        title="Regulatory & identification"
        desc={articled ? "ICAI details and articleship tracking apply to articled clerks." : undefined}
        bad={count(["pan", "aadhaar", "icai_registration_no", "articleship_start_date"])}
      >
        {!payVisible && <p className="text-sm text-muted-foreground">PAN and Aadhaar are visible only to the Managing Partner, Partners and Admin.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="pan" label="PAN" hint="Stored encrypted." error={errors.pan}>
            {input("pan", { placeholder: "ABCDE1234F", maxLength: 12, disabled: !payVisible })}
          </Field>
          <Field id="aadhaar" label="Aadhaar" hint="Stored encrypted." error={errors.aadhaar}>
            {input("aadhaar", { inputMode: "numeric", maxLength: 14, disabled: !payVisible })}
          </Field>
          {partnerType && (
            <Field id="icai_membership_no" label="ICAI membership no.">
              {input("icai_membership_no")}
            </Field>
          )}
          {articled && (
            <Field id="icai_registration_no" label="ICAI SRN" error={errors.icai_registration_no} hint="Starts with UXL, WRO, SRO, ERO, CRO or NRO. Leave blank for CMA students, who have no SRN.">
              {input("icai_registration_no", { placeholder: "e.g. SRO1234567" })}
            </Field>
          )}
        </div>
        {articled && (
          <div className="space-y-4 rounded-md border p-3">
            <p className="text-sm font-medium">Articleship (ICAI)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="articleship_registration_date" label="Registration date">
                {input("articleship_registration_date", { type: "date" })}
              </Field>
              <Field id="articleship_start_date" label="Articleship start" required error={errors.articleship_start_date}>
                {input("articleship_start_date", { type: "date" })}
              </Field>
              <Field id="articleship_end_date" label="Expected completion" hint="Three years from the start. You can change it.">
                {input("articleship_end_date", { type: "date" })}
              </Field>
              <Field id="industrial_training" label="Industrial training">
                {sel("industrial_training", [{ v: "yes", l: "Yes" }, { v: "no", l: "No" }], "Not set")}
              </Field>
              <Field id="articleship_exit_form" label="Termination / transfer form">
                {sel("articleship_exit_form", [{ v: "none", l: "None" }, { v: "form_108", l: "Form 108" }, { v: "form_109", l: "Form 109" }])}
              </Field>
              {v.articleship_exit_form !== "none" && (
                <Field id="articleship_exit_date" label="Form date">
                  {input("articleship_exit_date", { type: "date" })}
                </Field>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section n={4} title="Academic & professional qualifications" bad={count(["quals", "itt_completed", "itt_date", "orientation_completed", "orientation_date"])}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="highest_qualification" label="Highest qualification">
            {input("highest_qualification")}
          </Field>
          <Field id="ca_stage_level" label="CA stage / level">
            {sel("ca_stage_level", CA_STAGES.map((c) => ({ v: c, l: c })), "Select…")}
          </Field>
        </div>
        <div id="quals" tabIndex={-1} className="space-y-2">
          <p className="text-sm font-medium">Exams passed</p>
          {quals.length === 0 && <p className="text-sm text-muted-foreground">No rows yet. Add Class X, Class XII, graduation and CA exams.</p>}
          {quals.map((q, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-[1.4fr_1.6fr_0.7fr_0.7fr_auto] gap-2">
              <select
                aria-label="Exam passed"
                className={`${baseField} ${okBorder}`}
                value={q.exam}
                onChange={(e) => {
                  setQuals((p) => p.map((r, j) => (j === i ? { ...r, exam: e.target.value } : r)));
                  clearError("quals");
                }}
              >
                <Opt value="">Exam…</Opt>
                {EXAMS.map((x) => (
                  <Opt key={x} value={x}>
                    {x}
                  </Opt>
                ))}
              </select>
              <input aria-label="Board or university" placeholder="Board / university" className={`${baseField} ${okBorder}`} value={q.board} onChange={(e) => setQuals((p) => p.map((r, j) => (j === i ? { ...r, board: e.target.value } : r)))} />
              <input
                aria-label="Year of passing"
                placeholder="Year"
                inputMode="numeric"
                maxLength={4}
                className={`${baseField} ${errors.quals ? badBorder : okBorder}`}
                value={q.year}
                onChange={(e) => {
                  setQuals((p) => p.map((r, j) => (j === i ? { ...r, year: e.target.value } : r)));
                  clearError("quals");
                }}
              />
              <input
                aria-label="Percentage"
                placeholder="%"
                inputMode="decimal"
                className={`${baseField} ${errors.quals ? badBorder : okBorder}`}
                value={q.percentage}
                onChange={(e) => {
                  setQuals((p) => p.map((r, j) => (j === i ? { ...r, percentage: e.target.value } : r)));
                  clearError("quals");
                }}
              />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => setQuals((p) => p.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {errors.quals && (
            <p role="alert" className="flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-400">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {errors.quals}
            </p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setQuals((p) => [...p, { exam: "", board: "", year: "", percentage: "" }])}>
            <Plus className="size-4 mr-1" />
            Add exam
          </Button>
        </div>
        {articled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-3">
            <Field id="itt_completed" label="ITT completed" required error={errors.itt_completed}>
              {sel("itt_completed", YES_NO_NA, "Select…")}
            </Field>
            {v.itt_completed === "yes" && (
              <Field id="itt_date" label="ITT completion date" required error={errors.itt_date}>
                {input("itt_date", { type: "date" })}
              </Field>
            )}
            <Field id="orientation_completed" label="Orientation completed" required error={errors.orientation_completed}>
              {sel("orientation_completed", YES_NO_NA, "Select…")}
            </Field>
            {v.orientation_completed === "yes" && (
              <Field id="orientation_date" label="Orientation completion date" required error={errors.orientation_date}>
                {input("orientation_date", { type: "date" })}
              </Field>
            )}
          </div>
        )}
      </Section>

      {paidStaff && (
        <Section n={5} title="Past experience" desc="For paid staff.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field id="previous_firm" label="Previous firm / employer">
              {input("previous_firm")}
            </Field>
            <Field id="previous_designation" label="Previous designation">
              {input("previous_designation")}
            </Field>
            <Field id="tenure_from" label="Tenure from">
              {input("tenure_from", { type: "date" })}
            </Field>
            <Field id="tenure_to" label="Tenure to">
              {input("tenure_to", { type: "date" })}
            </Field>
            <Field id="last_drawn_ctc" label="Last drawn CTC (per year)" hint="Stored encrypted. Visible only to the Managing Partner, Partners and Admin.">
              {input("last_drawn_ctc", { inputMode: "decimal", disabled: !payVisible })}
            </Field>
            <Field id="notice_period" label="Notice period">
              {input("notice_period", { placeholder: "e.g. 30 days" })}
            </Field>
          </div>
        </Section>
      )}

      <Section n={6} title="Bank account details" desc="Can be left blank and added later." bad={count(["bank_ifsc"])}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="bank_account_holder" label="Name as per bank">
            {input("bank_account_holder")}
          </Field>
          <Field id="bank_name" label="Bank name">
            {input("bank_name")}
          </Field>
          <Field id="bank_branch" label="Branch">
            {input("bank_branch")}
          </Field>
          <Field id="bank_account_no" label="Account number" hint="Stored encrypted.">
            {input("bank_account_no", { inputMode: "numeric", disabled: !payVisible })}
          </Field>
          <Field id="bank_ifsc" label="IFSC" error={errors.bank_ifsc}>
            {input("bank_ifsc", { placeholder: "SBIN0001234", maxLength: 11, disabled: !payVisible })}
          </Field>
        </div>
      </Section>

      <Section n={7} title="Emergency contact" bad={count(["emergency_mobile"])}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field id="emergency_name" label="Name">
            {input("emergency_name")}
          </Field>
          <Field id="emergency_relationship" label="Relationship">
            {input("emergency_relationship")}
          </Field>
          <Field id="emergency_mobile" label="Mobile" error={errors.emergency_mobile}>
            {input("emergency_mobile")}
          </Field>
        </div>
      </Section>

      <Section n={8} title="Declaration & confidentiality undertaking" bad={count(["undertaking_name", "undertaking"])}>
        {alreadyAccepted ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-green-700 dark:text-green-400">
              Accepted by {s(init.undertaking_signatory) || "the employee"}
              {init.undertaking_place ? ` at ${s(init.undertaking_place)}` : ""} on{" "}
              {new Date(String(init.undertaking_accepted_at)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.
            </p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-muted-foreground">{s(init.undertaking_text)}</div>
          </div>
        ) : undertakingText?.is_placeholder ? (
          <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            The firm&apos;s confidentiality undertaking has not been entered yet, so it can&apos;t be accepted now. The Managing Partner enters the full text under Settings &gt; Security. After that, open this employee and use Edit details to record the acceptance.
          </p>
        ) : (
          <>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{undertakingText?.text ?? "Loading…"}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field id="undertaking_name" label="Employee's full name (acts as signature)" required={!edit} error={errors.undertaking_name}>
                {input("undertaking_name")}
              </Field>
              <Field id="undertaking_place" label="Place">
                {input("undertaking_place")}
              </Field>
            </div>
            <div className={`rounded-md p-2 ${errors.undertaking ? "border border-red-500 bg-red-50 dark:bg-red-950" : ""}`}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  id="undertaking"
                  type="checkbox"
                  className="mt-1"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    clearError("undertaking");
                  }}
                />
                <span>
                  The employee has read the undertaking above and accepts it. The date and time are recorded.
                  {!edit && <span className="text-red-600"> *</span>}
                </span>
              </label>
              {errors.undertaking && (
                <p role="alert" className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-400">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {errors.undertaking}
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section n={9} title="Document checklist" desc="Documents are collected as softcopy.">
        <p className="text-sm text-muted-foreground">
          Save the employee first. Then open their <strong>Documents</strong> tab to upload the softcopies, and tick each item on the{" "}
          <strong>Onboarding Checklist</strong> tab once checked.
          {articled ? " For articled clerks the list includes the ICAI ITT & Orientation certificates and the ICAI registration letter / articleship form." : ""}
          {paidStaff ? " For paid staff it includes the relieving letter and the last 3 months' payslips." : ""} A person can be given tasks only once every item is complete.
        </p>
      </Section>

      <Section n={10} title="For office use only" bad={count(["email", "salary"])}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="assigned_mentor_partner_id" label="Mentor / partner">
            {sel("assigned_mentor_partner_id", partners.map((p) => ({ v: p.id, l: p.name })), "Not assigned")}
          </Field>
          <Field id="authorised_signatory" label="Authorised signatory (firm)">
            {sel("authorised_signatory", partners.map((p) => ({ v: p.name, l: p.name })), "Not set")}
          </Field>
          <Field id="email" label="Official email" hint="Also used to link this person's login." error={errors.email}>
            {input("email", { type: "email" })}
          </Field>
          <Field id="salary" label={articled ? "Stipend (per month)" : "Salary (per month)"} hint="Stored encrypted." error={errors.salary}>
            {input("salary", { inputMode: "decimal", disabled: !payVisible })}
          </Field>
        </div>
      </Section>

      {serverError && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : edit ? "Save details" : "Create employee"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
