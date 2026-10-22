"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Rec = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const date = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null;
const YNN: Record<string, string> = { yes: "Yes", no: "No", na: "Not applicable" };
const EXIT: Record<string, string> = { none: "None", form_108: "Form 108", form_109: "Form 109" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground font-medium break-words">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">{children}</dl>
      </CardContent>
    </Card>
  );
}

/** The staff onboarding form's details, as shown on the employee's profile (FR-38, FR-39, FR-41). */
export function EmployeeMoreDetails({ employee, payVisible }: { employee: Rec; payVisible: boolean }) {
  const e = employee;
  const quals = Array.isArray(e.qualifications) ? (e.qualifications as Rec[]) : [];
  const articled = e.position_type === "articled_clerk";
  const accepted = e.undertaking_accepted_at ? new Date(String(e.undertaking_accepted_at)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="space-y-4">
      <Block title="Personal & contact">
        <Row label="Date of birth" value={date(e.date_of_birth)} />
        <Row label="Gender" value={s(e.gender) ? String(e.gender).charAt(0).toUpperCase() + String(e.gender).slice(1) : null} />
        <Row label="Blood group" value={s(e.blood_group)} />
        <Row label="Father / guardian" value={s(e.father_guardian_name)} />
        <Row label="Alternate contact" value={s(e.alt_contact)} />
        <Row label="Personal email" value={s(e.personal_email)} />
        <Row label="Permanent address" value={s(e.permanent_address) ? `${s(e.permanent_address)}${s(e.permanent_pin) ? ` - ${s(e.permanent_pin)}` : ""}` : null} />
        <Row label="Current address" value={s(e.current_address) ? `${s(e.current_address)}${s(e.current_pin) ? ` - ${s(e.current_pin)}` : ""}` : null} />
        <Row label="Emergency contact" value={s(e.emergency_name) ? `${s(e.emergency_name)}${s(e.emergency_relationship) ? ` (${s(e.emergency_relationship)})` : ""}${s(e.emergency_mobile) ? `, ${s(e.emergency_mobile)}` : ""}` : null} />
      </Block>

      {(quals.length > 0 || s(e.highest_qualification) || s(e.ca_stage_level) || (articled && (s(e.itt_completed) || s(e.orientation_completed)))) && (
        <Block title="Qualifications">
          <Row label="Highest qualification" value={s(e.highest_qualification)} />
          <Row label="CA stage / level" value={s(e.ca_stage_level)} />
          {articled && <Row label="ITT" value={s(e.itt_completed) ? `${YNN[String(e.itt_completed)] ?? e.itt_completed}${e.itt_date ? ` (${date(e.itt_date)})` : ""}` : null} />}
          {articled && <Row label="Orientation" value={s(e.orientation_completed) ? `${YNN[String(e.orientation_completed)] ?? e.orientation_completed}${e.orientation_date ? ` (${date(e.orientation_date)})` : ""}` : null} />}
          {quals.length > 0 && (
            <div className="py-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-1 font-normal">Exam</th>
                    <th className="pb-1 font-normal">Board / university</th>
                    <th className="pb-1 font-normal">Year</th>
                    <th className="pb-1 font-normal">%</th>
                  </tr>
                </thead>
                <tbody>
                  {quals.map((q, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">{s(q.exam) ?? "—"}</td>
                      <td className="py-1">{s(q.board) ?? "—"}</td>
                      <td className="py-1">{s(q.year) ?? "—"}</td>
                      <td className="py-1">{s(q.percentage) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Block>
      )}

      {(s(e.previous_firm) || s(e.previous_designation) || e.tenure_from || e.tenure_to || s(e.notice_period) || (payVisible && s(e.last_drawn_ctc))) && (
        <Block title="Past experience">
          <Row label="Previous firm" value={s(e.previous_firm)} />
          <Row label="Previous designation" value={s(e.previous_designation)} />
          <Row label="Tenure" value={e.tenure_from || e.tenure_to ? `${date(e.tenure_from) ?? "?"} to ${date(e.tenure_to) ?? "?"}` : null} />
          <Row label="Notice period" value={s(e.notice_period)} />
          {payVisible && <Row label="Last drawn CTC (per year)" value={s(e.last_drawn_ctc)} />}
        </Block>
      )}

      {payVisible && (s(e.bank_name) || s(e.bank_branch) || s(e.bank_account_holder)) && (
        <Block title="Bank details">
          <Row label="Name as per bank" value={s(e.bank_account_holder)} />
          <Row label="Bank" value={s(e.bank_name)} />
          <Row label="Branch" value={s(e.bank_branch)} />
        </Block>
      )}

      <Block title="Office use">
        <Row label="Authorised signatory" value={s(e.authorised_signatory)} />
        <Row
          label="Confidentiality undertaking"
          value={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={accepted ? "default" : "outline"}>{accepted ? "Accepted" : "Pending"}</Badge>
              {accepted && (
                <span className="text-xs text-muted-foreground">
                  {accepted}
                  {s(e.undertaking_signatory) ? ` by ${s(e.undertaking_signatory)}` : ""}
                  {s(e.undertaking_place) ? `, ${s(e.undertaking_place)}` : ""}
                </span>
              )}
            </span>
          }
        />
      </Block>
    </div>
  );
}

/** Extra articleship rows for the Articleship tab (FR-41). */
export function ArticleshipExtras({ employee }: { employee: Rec }) {
  const e = employee;
  return (
    <>
      <Row label="Registration date" value={date(e.articleship_registration_date)} />
      <Row label="ITT" value={s(e.itt_completed) ? `${YNN[String(e.itt_completed)] ?? e.itt_completed}${e.itt_date ? ` (${date(e.itt_date)})` : ""}` : null} />
      <Row label="Orientation" value={s(e.orientation_completed) ? `${YNN[String(e.orientation_completed)] ?? e.orientation_completed}${e.orientation_date ? ` (${date(e.orientation_date)})` : ""}` : null} />
      <Row label="Industrial training" value={e.industrial_training === true ? "Yes" : e.industrial_training === false ? "No" : null} />
      <Row label="Termination / transfer form" value={s(e.articleship_exit_form) && e.articleship_exit_form !== "none" ? `${EXIT[String(e.articleship_exit_form)] ?? e.articleship_exit_form}${e.articleship_exit_date ? ` (${date(e.articleship_exit_date)})` : ""}` : null} />
    </>
  );
}
