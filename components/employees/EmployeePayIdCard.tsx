"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Landmark, Lock, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PayIdValues {
  salary: number | null;
  pan: string | null;
  aadhaar: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
}

interface Props {
  employeeId: string;
  values: PayIdValues;
  /** The viewer may see the values in full (MP, Partner, Admin, or the employee themself). */
  visible: boolean;
  /** The viewer may change them (MP, Partner or Admin with edit access). */
  canEdit: boolean;
  onSaved: (values: PayIdValues) => void;
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function formatRupees(n: number | null) {
  if (n === null) return null;
  return `₹${n.toLocaleString("en-IN")}`;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium text-foreground break-all ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

/**
 * Salary, PAN, Aadhaar and bank details (FR-04, DM-03). Values arrive already
 * decrypted or masked by the server, so a role without access only ever
 * receives the masked form. Saved values are encrypted by the server.
 */
export function EmployeePayIdCard({ employeeId, values, visible, canEdit, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [form, setForm] = useState({ salary: "", pan: "", aadhaar: "", bank_account_no: "", bank_ifsc: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function startEdit() {
    setForm({
      salary: values.salary === null ? "" : String(values.salary),
      pan: values.pan ?? "",
      aadhaar: values.aadhaar ?? "",
      bank_account_no: values.bank_account_no ?? "",
      bank_ifsc: values.bank_ifsc ?? "",
    });
    setErrors({});
    setEditing(true);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    const pan = form.pan.trim().toUpperCase().replace(/\s/g, "");
    const aadhaar = form.aadhaar.replace(/[\s-]/g, "");
    const ifsc = form.bank_ifsc.trim().toUpperCase();
    const account = form.bank_account_no.replace(/\s/g, "");
    if (form.salary.trim() && !(Number(form.salary) >= 0)) e.salary = "Enter a number, for example 25000";
    if (pan && !PAN_RE.test(pan)) e.pan = "Format AAAAA9999A";
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) e.aadhaar = "12 digits";
    if (account && !/^\d{6,20}$/.test(account)) e.bank_account_no = "Digits only, 6 to 20";
    if (ifsc && !IFSC_RE.test(ifsc)) e.bank_ifsc = "11 characters, for example SBIN0001234";
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const next: PayIdValues = {
      salary: form.salary.trim() ? Number(form.salary) : null,
      pan: form.pan.trim() ? form.pan.trim().toUpperCase().replace(/\s/g, "") : null,
      aadhaar: form.aadhaar.trim() ? form.aadhaar.replace(/[\s-]/g, "") : null,
      bank_account_no: form.bank_account_no.trim() ? form.bank_account_no.replace(/\s/g, "") : null,
      bank_ifsc: form.bank_ifsc.trim() ? form.bank_ifsc.trim().toUpperCase() : null,
    };
    // Send only what changed.
    const body: Record<string, unknown> = {};
    (Object.keys(next) as (keyof PayIdValues)[]).forEach((k) => {
      if (next[k] !== values[k]) body[k] = next[k];
    });
    if (!Object.keys(body).length) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Couldn't save these details");
        return;
      }
      onSaved(next);
      setEditing(false);
      toast.success("Details saved");
    } catch {
      toast.error("Couldn't save these details");
    } finally {
      setSaving(false);
    }
  }

  // An empty value (null or "") reads as "not entered", shown as a dash.
  const shown = (v: string | null) => (!v ? null : reveal || !visible ? v : `••••••${v.slice(-4)}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="size-4" />
          Pay &amp; ID details
        </CardTitle>
        {!editing && (
          <div className="flex items-center gap-2">
            {visible && (
              <Button variant="ghost" size="sm" onClick={() => setReveal((r) => !r)}>
                {reveal ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />}
                {reveal ? "Hide" : "Show"}
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="size-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <>
            <dl className="divide-y divide-border">
              <Row
                label="Monthly salary / stipend"
                value={
                  visible ? (
                    formatRupees(values.salary)
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                      <Lock className="size-3" /> Restricted
                    </span>
                  )
                }
              />
              <Row label="PAN" value={shown(values.pan)} mono />
              <Row label="Aadhaar" value={shown(values.aadhaar)} mono />
              <Row label="Bank account number" value={shown(values.bank_account_no)} mono />
              <Row
                label="IFSC"
                value={
                  visible ? (
                    values.bank_ifsc || null
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground font-normal">
                      <Lock className="size-3" /> Restricted
                    </span>
                  )
                }
                mono
              />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {visible
                ? "Stored encrypted. Shown masked until you choose Show."
                : "Only the last 4 characters are shown to your role. Salary and bank details are restricted."}
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  ["salary", "Monthly salary / stipend (₹)", "25000", "decimal"],
                  ["pan", "PAN", "AAAAA9999A", "text"],
                  ["aadhaar", "Aadhaar (12 digits)", "123412341234", "numeric"],
                  ["bank_account_no", "Bank account number", "", "numeric"],
                  ["bank_ifsc", "IFSC", "SBIN0001234", "text"],
                ] as const
              ).map(([key, label, placeholder, mode]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`pay-${key}`}>{label}</Label>
                  <Input
                    id={`pay-${key}`}
                    value={form[key]}
                    placeholder={placeholder}
                    inputMode={mode}
                    autoComplete="off"
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    aria-invalid={!!errors[key]}
                  />
                  {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave a box empty to clear it. Values are encrypted when saved.</p>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
