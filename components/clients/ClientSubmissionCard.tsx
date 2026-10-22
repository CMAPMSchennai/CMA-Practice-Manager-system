"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ClientSubmission {
  submitted_at?: string;
  services?: { id: string; name: string }[];
  documents?: Record<string, string>;
  declaration?: { accepted?: boolean; signatory_name?: string; at?: string };
  draft_engagements?: { created?: string[]; skipped?: string[] };
}

const DOC_LABELS: Record<string, string> = {
  cert_incorporation: "Certificate of Incorporation",
  moa_aoa_deed: "LLP Agreement / Partnership Deed / MoA & AoA",
  entity_pan_card: "Entity PAN card",
  gst_certificate: "GST registration certificate",
  kyc_signatories: "KYC/ID proof of signatories",
  cancelled_cheque: "Cancelled cheque / bank details",
};
const ANSWER: Record<string, string> = {
  have: "Ready",
  later: "Will send later",
  na: "Not applicable",
};

/** What the client said on their own onboarding form (FR-31). Statements only: staff verify and tick the checklist. */
export function ClientSubmissionCard({ submission }: { submission: ClientSubmission | null | undefined }) {
  if (!submission?.submitted_at) return null;
  const when = new Date(submission.submitted_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const created = submission.draft_engagements?.created ?? [];
  const skipped = submission.draft_engagements?.skipped ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Client onboarding form</CardTitle>
        <p className="text-xs text-muted-foreground">
          Submitted {when}
          {submission.declaration?.signatory_name ? ` by ${submission.declaration.signatory_name}` : ""}. Declaration accepted.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="mb-1 font-medium">Services asked for</p>
          {submission.services?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {submission.services.map((s) => (
                <Badge key={s.id} variant="secondary">
                  {s.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">None chosen.</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-medium">Documents (the client&apos;s answer)</p>
          <ul className="space-y-0.5">
            {Object.entries(DOC_LABELS).map(([code, label]) => (
              <li key={code} className="flex justify-between gap-3">
                <span>{label}</span>
                <span className="text-muted-foreground">{ANSWER[submission.documents?.[code] ?? "later"] ?? "Will send later"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">These are statements only. Tick the checklist items once you have checked the documents.</p>
        </div>
        {(created.length > 0 || skipped.length > 0) && (
          <div>
            <p className="mb-1 font-medium">Draft engagements</p>
            {created.length > 0 && <p>Created: {created.join(", ")}</p>}
            {skipped.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground">
                {skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
