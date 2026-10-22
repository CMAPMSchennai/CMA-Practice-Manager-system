"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Building2, Loader2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface TokenInfo {
  valid: boolean;
  client: Record<string, string | number | null> | null;
  entity_types: { id: string; label: string }[];
  services: { id: string; name: string }[];
  expires_at: string;
}

/** The six documents the PDF's preliminary checklist asks about (FR-31). */
const DOCS = [
  { code: "cert_incorporation", label: "Certificate of Incorporation" },
  { code: "moa_aoa_deed", label: "LLP Agreement / Partnership Deed / MoA & AoA" },
  { code: "entity_pan_card", label: "Entity PAN card" },
  { code: "gst_certificate", label: "GST registration certificate" },
  { code: "kyc_signatories", label: "KYC/ID proof of signatory / partners (PAN + Aadhaar / Passport)" },
  { code: "cancelled_cheque", label: "Cancelled cheque / bank details" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COMMS = ["Email", "Phone", "Video", "In-Person"];
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Solid background and text colour so the typed text and the dropdown choices are always readable. */
const baseField =
  "flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const okBorder = "border-input";
const badBorder = "border-red-500 ring-1 ring-red-500";

/** Field names mapped to the label shown in the "fix these" bar, in form order. */
const LABELS: Record<string, string> = {
  address: "Registered address",
  pin: "PIN code",
  contact_person: "Contact name",
  contact_email: "Contact email",
  contact_phone: "Contact phone",
  pan: "PAN",
  gstin: "GSTIN",
  billing_email: "Billing email",
  signatory_name: "Signatory name",
  declaration: "Declaration",
};

function Section({ n, title, desc, bad, children }: { n: number; title: string; desc?: string; bad?: number; children: React.ReactNode }) {
  return (
    <Card className={bad ? "border-red-500" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
          {title}
          {bad ? (
            <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
              {bad} to fix
            </span>
          ) : null}
        </CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
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

export function PublicOnboardingForm({ token }: { token: string }) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [v, setV] = useState<Record<string, string>>({});
  const [services, setServices] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<Record<string, string>>(Object.fromEntries(DOCS.map((d) => [d.code, "later"])));
  const [declared, setDeclared] = useState(false);

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
    setLoading(true);
    fetch(`/api/onboarding/${token}`)
      .then((r) => r.json())
      .then((data: TokenInfo & { error?: string }) => {
        if (data.error) {
          setTokenError(data.error);
          return;
        }
        setInfo(data);
        const c = data.client ?? {};
        const s = (k: string) => (c[k] == null ? "" : String(c[k]));
        setV({
          trade_name: s("trade_name"),
          entity_type_id: s("entity_type_id"),
          incorporation_date: s("incorporation_date").slice(0, 10),
          registration_no: s("registration_no"),
          address: s("address"),
          city: s("city"),
          state: s("state"),
          pin: s("pin"),
          contact_person: s("contact_person"),
          designation: s("designation"),
          contact_email: s("contact_email"),
          contact_phone: s("contact_phone"),
          preferred_communication: s("preferred_communication"),
          pan: "",
          gstin: s("gstin"),
          financial_year_end_month: s("financial_year_end_month") || "3",
          billing_email: s("billing_email"),
          signatory_name: "",
        });
      })
      .catch(() => setTokenError("Could not validate onboarding link."))
      .finally(() => setLoading(false));
  }, [token]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = info?.services ?? [];
    return q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;
  }, [info, search]);

  /** Every problem at once, keyed by field, so the person can see all that is missing. */
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!(v.address ?? "").trim()) e.address = "Enter the registered address.";
    if (v.pin && !/^\d{6}$/.test(v.pin)) e.pin = "Enter a 6-digit PIN code.";
    if (!(v.contact_person ?? "").trim()) e.contact_person = "Enter the contact person's name.";
    if (!(v.contact_email ?? "").trim()) e.contact_email = "Enter an email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact_email)) e.contact_email = "This email doesn't look right.";
    if (!(v.contact_phone ?? "").trim()) e.contact_phone = "Enter a phone number.";
    else if (v.contact_phone.replace(/\D/g, "").length < 10) e.contact_phone = "Enter at least 10 digits.";
    if (!(v.pan ?? "").trim()) e.pan = "Enter the PAN.";
    else if (!PAN_RE.test(v.pan.toUpperCase())) e.pan = "PAN looks like ABCDE1234F (5 letters, 4 digits, 1 letter).";
    if (v.gstin && !GSTIN_RE.test(v.gstin.toUpperCase())) e.gstin = "GSTIN has 15 characters: 2 digits, 5 capital letters, 4 digits, 1 letter, then a letter or digit (not 0), the letter Z, and a letter or digit. Example: 22ABCDE1234F1Z5.";
    if (v.billing_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.billing_email)) e.billing_email = "This email doesn't look right.";
    if (!(v.signatory_name ?? "").trim()) e.signatory_name = "Type the authorised signatory's full name.";
    if (!declared) e.declaration = "Please tick the box to accept the declaration.";
    return e;
  }

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => el.focus({ preventScroll: true }), 350);
  }

  const bySection = (ids: string[]) => ids.filter((i) => errors[i]).length;
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
    setSubmitting(true);
    try {
      const res = await fetch(`/api/onboarding/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...v,
          pan: v.pan.toUpperCase(),
          gstin: (v.gstin ?? "").toUpperCase(),
          financial_year_end_month: Number(v.financial_year_end_month),
          service_type_ids: services,
          documents: docs,
          declaration: declared,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Submission failed. Please try again.";
        setServerError(msg);
        toast.error(msg);
        return;
      }
      setSubmitted(true);
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="size-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="size-12 text-red-600 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Link Invalid or Expired</h2>
            <p className="text-sm text-muted-foreground">{tokenError}</p>
            <p className="text-sm text-muted-foreground">Please contact the firm to request a new onboarding link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-green-100 mx-auto">
              <CheckCircle2 className="size-9 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Submission received</h2>
            <p className="text-muted-foreground text-sm">
              Thank you, <strong>{String(info?.client?.name ?? "")}</strong>. Your details have been received. Our team will
              review them, check the documents with you and get back to you shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted mx-auto">
            <Building2 className="size-7 text-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Client Onboarding Form</h1>
          <p className="text-muted-foreground text-sm">
            Chandramouli &amp; Associates LLP · for <span className="font-medium text-foreground">{String(info?.client?.name ?? "")}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-red-600">*</span> are required. Your information is kept confidential.
          </p>
        </div>

        {errorIds.length > 0 && (
          <div
            role="alert"
            className="sticky top-2 z-20 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-red-900 shadow-md dark:bg-red-950 dark:text-red-100"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="size-4" aria-hidden="true" />
              {errorIds.length} thing{errorIds.length === 1 ? "" : "s"} still to fill in. Tap one to jump to it:
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

        <Section n={1} title="Primary entity information" bad={bySection(["address", "pin"])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="legal_name" label="Legal name">
              <input id="legal_name" className={`${baseField} ${okBorder} opacity-70`} value={String(info?.client?.name ?? "")} readOnly disabled />
            </Field>
            <Field id="trade_name" label="Trade name / DBA">
              <input id="trade_name" className={cls("trade_name")} value={v.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} />
            </Field>
            <Field id="entity_type" label="Entity type">
              <select id="entity_type" className={cls("entity_type")} value={v.entity_type_id ?? ""} onChange={(e) => set("entity_type_id", e.target.value)}>
                <option value="" className="bg-background text-foreground">
                  Select…
                </option>
                {(info?.entity_types ?? []).map((t) => (
                  <option key={t.id} value={t.id} className="bg-background text-foreground">
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="incorporation_date" label="Date of incorporation / registration">
              <input id="incorporation_date" type="date" className={cls("incorporation_date")} value={v.incorporation_date ?? ""} onChange={(e) => set("incorporation_date", e.target.value)} />
            </Field>
            <Field id="registration_no" label="Registration no. (CIN / LLPIN)">
              <input id="registration_no" className={cls("registration_no")} value={v.registration_no ?? ""} onChange={(e) => set("registration_no", e.target.value)} />
            </Field>
          </div>
          <Field id="address" label="Registered address" required error={errors.address}>
            <textarea
              id="address"
              rows={2}
              className={`${baseField} h-auto min-h-16 ${errors.address ? badBorder : okBorder}`}
              value={v.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="city" label="City">
              <input id="city" className={cls("city")} value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field id="state" label="State">
              <input id="state" className={cls("state")} value={v.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field id="pin" label="PIN code" error={errors.pin}>
              <input id="pin" inputMode="numeric" maxLength={6} className={cls("pin")} value={v.pin ?? ""} onChange={(e) => set("pin", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section n={2} title="Authorised contact representative" bad={bySection(["contact_person", "contact_email", "contact_phone"])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="contact_person" label="Name" required error={errors.contact_person}>
              <input id="contact_person" className={cls("contact_person")} value={v.contact_person ?? ""} onChange={(e) => set("contact_person", e.target.value)} />
            </Field>
            <Field id="designation" label="Designation">
              <input id="designation" className={cls("designation")} value={v.designation ?? ""} onChange={(e) => set("designation", e.target.value)} />
            </Field>
            <Field id="contact_email" label="Email" required error={errors.contact_email}>
              <input id="contact_email" type="email" className={cls("contact_email")} value={v.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} />
            </Field>
            <Field id="contact_phone" label="Phone" required error={errors.contact_phone}>
              <input id="contact_phone" className={cls("contact_phone")} placeholder="+91 XXXXX XXXXX" value={v.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
            </Field>
            <Field id="preferred" label="Preferred way to be contacted">
              <select id="preferred" className={cls("preferred")} value={v.preferred_communication ?? ""} onChange={(e) => set("preferred_communication", e.target.value)}>
                <option value="" className="bg-background text-foreground">
                  No preference
                </option>
                {COMMS.map((c) => (
                  <option key={c} value={c} className="bg-background text-foreground">
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section n={3} title="Financial & tax registrations" bad={bySection(["pan", "gstin", "billing_email"])}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="pan" label="PAN" required hint="Stored encrypted." error={errors.pan}>
              <input id="pan" maxLength={10} className={cls("pan")} placeholder="ABCDE1234F" value={v.pan ?? ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
            </Field>
            <Field id="gstin" label="GSTIN" hint="Leave blank if not registered." error={errors.gstin}>
              <input id="gstin" maxLength={15} className={cls("gstin")} value={v.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
            </Field>
            <Field id="fy" label="Financial year ends in">
              <select id="fy" className={cls("fy")} value={v.financial_year_end_month ?? "3"} onChange={(e) => set("financial_year_end_month", e.target.value)}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)} className="bg-background text-foreground">
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="billing_email" label="Billing email" hint="Where invoices should be sent." error={errors.billing_email}>
              <input id="billing_email" type="email" className={cls("billing_email")} value={v.billing_email ?? ""} onChange={(e) => set("billing_email", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section n={4} title="Scope of services required" desc="Tick every service you would like us to handle. You can change this later with the firm.">
          <input className={`${baseField} ${okBorder}`} placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search services" />
          {services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(info?.services ?? [])
                .filter((s) => services.includes(s.id))
                .map((s) => (
                  <Badge key={s.id} variant="secondary" className="cursor-pointer" onClick={() => setServices((p) => p.filter((x) => x !== s.id))}>
                    {s.name} ×
                  </Badge>
                ))}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {shown.length === 0 && <p className="p-3 text-sm text-muted-foreground">No services match.</p>}
            {shown.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={services.includes(s.id)}
                  onChange={(e) => setServices((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
                {s.name}
              </label>
            ))}
          </div>
        </Section>

        <Section n={5} title="Preliminary document checklist" desc="Tell us which documents you can supply. Our team will collect and verify them with you.">
          <div className="space-y-2">
            {DOCS.map((d) => (
              <div key={d.code} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">{d.label}</span>
                <select
                  className={`${baseField} ${okBorder} sm:w-48`}
                  aria-label={d.label}
                  value={docs[d.code]}
                  onChange={(e) => setDocs((p) => ({ ...p, [d.code]: e.target.value }))}
                >
                  <option value="have" className="bg-background text-foreground">
                    I have it ready
                  </option>
                  <option value="later" className="bg-background text-foreground">
                    I will send it later
                  </option>
                  <option value="na" className="bg-background text-foreground">
                    Not applicable
                  </option>
                </select>
              </div>
            ))}
          </div>
        </Section>

        <Section n={6} title="Declaration & authorisation" bad={bySection(["signatory_name", "declaration"])}>
          <p className="text-sm text-muted-foreground">
            I confirm that the information given in this form is true and complete, and I am authorised to engage Chandramouli &amp;
            Associates LLP on behalf of the entity named above.
          </p>
          <Field id="signatory_name" label="Authorised signatory (type full name)" required error={errors.signatory_name}>
            <input id="signatory_name" className={cls("signatory_name")} value={v.signatory_name ?? ""} onChange={(e) => set("signatory_name", e.target.value)} />
          </Field>
          <div className={`rounded-md p-2 ${errors.declaration ? "border border-red-500 bg-red-50 dark:bg-red-950" : ""}`}>
            <label className="flex items-start gap-2 text-sm">
              <input
                id="declaration"
                type="checkbox"
                className="mt-1"
                checked={declared}
                onChange={(e) => {
                  setDeclared(e.target.checked);
                  clearError("declaration");
                }}
              />
              <span>
                I accept this declaration. Today&apos;s date is recorded with my submission. <span className="text-red-600">*</span>
              </span>
            </label>
            {errors.declaration && (
              <p role="alert" className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700 dark:text-red-400">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {errors.declaration}
              </p>
            )}
          </div>
        </Section>

        {serverError && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit form"}
        </Button>
      </form>
    </div>
  );
}
