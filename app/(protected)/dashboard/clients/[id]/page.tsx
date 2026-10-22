"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Users, Copy, CheckCircle2, Circle,
  AlertTriangle, ShieldCheck, FileText
} from "lucide-react";
import { DocumentVault } from "@/components/documents/DocumentVault";
import { FilingCabinet } from "@/components/clients/FilingCabinet";
import { ClientActivityTimeline } from "@/components/clients/ClientActivityTimeline";
import { ClientEngagementsTab, ClientTasksTab, ClientBillingTab } from "@/components/clients/ClientWorkTabs";
import { ImportedDetailsCard, type ExtraDetails } from "@/components/records/ImportedDetailsCard";
import { ClientSubmissionCard, type ClientSubmission } from "@/components/clients/ClientSubmissionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Client {
  id: string;
  client_code: string;
  name: string;
  trade_name: string | null;
  entity_type_id: string | null;
  entity_type_label: string | null;
  pan: string | null;
  gstin: string | null;
  address: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  group_id: string | null;
  group_name: string | null;
  partner_in_charge_id: string | null;
  partner_name: string | null;
  financial_year_end_month: number | null;
  onboarding_status: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
  extra_details?: ExtraDetails | null;
}

interface ChecklistItem {
  checklist_item_code: string;
  label: string;
  is_complete: boolean;
  kind: "manual" | "auto" | "conflict";
  completed_at: string | null;
  completed_by_name: string | null;
  notes: string | null;
  override_justification: string | null;
}

interface ConflictResult {
  has_conflict: boolean;
  conflicts: Array<{ client_name: string; group_name: string; reason: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  imported: "Imported",
  kyc_and_docs: "KYC & Docs",
  conflict_check: "Conflict Check",
  engagement_letter: "Engagement Letter",
  activated: "Activated",
};

const STATUS_TONES: Record<string, StatusTone> = {
  imported: "neutral",
  kyc_and_docs: "calm",
  conflict_check: "warn",
  engagement_letter: "warn",
  activated: "ok",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2.5 border-b border-border last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground font-medium">{value ?? "—"}</dd>
    </div>
  );
}

// ── Conflict Check Dialog ──────────────────────────────────────────────────────
function ConflictCheckDialog({
  open,
  onOpenChange,
  result,
  canRecord,
  recording,
  onRecord,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: ConflictResult | null;
  canRecord: boolean;
  recording: boolean;
  onRecord: (outcome: "clear" | "cleared_after_review", note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result?.has_conflict ? (
              <AlertTriangle className="size-5 text-amber-500" />
            ) : (
              <ShieldCheck className="size-5 text-green-600" />
            )}
            Conflict Check Result
          </DialogTitle>
          <DialogDescription>
            {result?.has_conflict
              ? "Potential related-party conflicts were detected for this client."
              : "No conflicts found. The client may proceed to the next stage."}
          </DialogDescription>
        </DialogHeader>
        {result?.has_conflict && result.conflicts.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {result.conflicts.map((c, i) => (
              <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-800">{c.client_name}</p>
                <p className="text-amber-700">{c.group_name} — {c.reason}</p>
              </div>
            ))}
          </div>
        )}
        {canRecord ? (
          <div className="space-y-2">
            <Label htmlFor="conflict-note">
              {result?.has_conflict ? "Why are you proceeding despite these? (required)" : "Note (optional)"}
            </Label>
            <Textarea id="conflict-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Recording this saves your name and today's date against the checklist item.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only a Partner or the Managing Partner can record the result on the checklist.
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {canRecord && (
            <Button
              disabled={recording || (!!result?.has_conflict && !note.trim())}
              onClick={() => onRecord(result?.has_conflict ? "cleared_after_review" : "clear", note)}
            >
              {recording ? "Recording…" : result?.has_conflict ? "Record: proceed after review" : "Record: no conflict"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Onboarding Override Dialog ─────────────────────────────────────────────────
function OnboardingOverrideDialog({
  open,
  onOpenChange,
  clientId,
  itemCode,
  itemLabel,
  onOverridden,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  itemCode: string;
  itemLabel: string;
  onOverridden: () => void;
}) {
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!justification.trim()) {
      toast.error("Justification is required for MP override.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/checklist-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist_item_code: itemCode, justification }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Override failed");
        return;
      }
      toast.success("Checklist item overridden successfully.");
      setJustification("");
      onOpenChange(false);
      onOverridden();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>MP Override — Checklist Item</DialogTitle>
          <DialogDescription>
            Provide a written justification to override: <strong>{itemLabel}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="justification">Justification</Label>
          <Textarea
            id="justification"
            placeholder="Enter MP justification for this override..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !justification.trim()}>
            {saving ? "Saving..." : "Submit Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenGenerating, setTokenGenerating] = useState(false);

  // Conflict check
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);

  // Override dialog
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideItem, setOverrideItem] = useState<ChecklistItem | null>(null);

  // What the signed-in user may do on the checklist, and activation
  const [canEditChecklist, setCanEditChecklist] = useState(false);
  const [canOverrideChecklist, setCanOverrideChecklist] = useState(false);
  const [canRecordConflict, setCanRecordConflict] = useState(false);
  const [recordingConflict, setRecordingConflict] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [savingFy, setSavingFy] = useState(false);

  function loadClient() {
    if (!params.id) return;
    setLoading(true);
    fetch(`/api/clients/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { toast.error(data.error); return; }
        setClient(data.client ?? null);
      })
      .catch(() => toast.error("Failed to load client"))
      .finally(() => setLoading(false));
  }

  function loadChecklist() {
    if (!params.id) return;
    fetch(`/api/clients/${params.id}/checklist`)
      .then((r) => r.json())
      .then((data) => {
        setChecklist(Array.isArray(data.items) ? data.items : []);
        setCanEditChecklist(!!data.can_edit);
        setCanOverrideChecklist(!!data.can_override);
        setCanRecordConflict(!!data.can_record_conflict);
      })
      .catch(() => {});
  }

  async function toggleItem(code: string, complete: boolean) {
    if (!client) return;
    setBusyCode(code);
    try {
      const res = await fetch(`/api/clients/${client.id}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, complete }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? "Could not update the checklist"); return; }
      loadChecklist();
    } finally {
      setBusyCode(null);
    }
  }

  async function recordConflict(outcome: "clear" | "cleared_after_review", note: string) {
    if (!client) return;
    setRecordingConflict(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/conflict-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? "Could not record the conflict check"); return; }
      toast.success("Conflict check recorded.");
      setConflictOpen(false);
      loadChecklist();
      loadClient();
    } finally {
      setRecordingConflict(false);
    }
  }

  async function activateClient() {
    if (!client) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_status: "activated" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? "Could not activate the client"); return; }
      toast.success("Client activated.");
      loadClient();
    } finally {
      setActivating(false);
    }
  }

  // The month the client's financial year ends in. It sets the periods of yearly, half-yearly
  // and quarterly work created from now on; engagements that already exist keep their dates.
  async function saveFyMonth(value: string) {
    if (!client) return;
    setSavingFy(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financial_year_end_month: Number(value) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? "Could not save the financial year"); return; }
      toast.success("Financial year saved. It applies to work created from now on.");
      loadClient();
    } finally {
      setSavingFy(false);
    }
  }

  useEffect(() => {
    loadClient();
    loadChecklist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function generateLink() {
    if (!client) return;
    setTokenGenerating(true);
    try {
      const res = await fetch("/api/onboarding-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client.id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Failed to generate link"); return; }
      const link = `${window.location.origin}/onboarding/${json.token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Onboarding link copied! Expires in 7 days.");
    } catch {
      toast.error("Failed to generate link");
    } finally {
      setTokenGenerating(false);
    }
  }

  async function runConflictCheck() {
    if (!client) return;
    setConflictLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/conflict-check`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? "Conflict check failed"); return; }
      setConflictResult(json);
      setConflictOpen(true);
    } catch {
      toast.error("Failed to run conflict check");
    } finally {
      setConflictLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-muted-foreground">Client not found.</p>
        <Button variant="link" onClick={() => router.push("/dashboard/clients")} className="p-0 mt-2">
          Back
        </Button>
      </div>
    );
  }

  const completedChecklist = checklist.filter((i) => i.is_complete).length;
  const checklistPct = checklist.length > 0 ? Math.round((completedChecklist / checklist.length) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/clients")}>
        <ArrowLeft className="size-4 mr-2" /> Back to Directory
      </Button>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Users className="size-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-foreground truncate">{client.name}</h1>
                <StatusChip tone={STATUS_TONES[client.onboarding_status] ?? "neutral"}>
                  {STATUS_LABELS[client.onboarding_status] ?? client.onboarding_status}
                </StatusChip>
                {!client.is_active && <Badge variant="outline">Inactive</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {client.client_code}
                {client.trade_name ? ` · ${client.trade_name}` : ""}
                {client.entity_type_label ? ` · ${client.entity_type_label}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={runConflictCheck}
                disabled={conflictLoading}
              >
                <ShieldCheck className="size-4 mr-2" />
                {conflictLoading ? "Checking..." : "Conflict Check"}
              </Button>
              <Button size="sm" variant="outline" onClick={generateLink} disabled={tokenGenerating}>
                <Copy className="size-4 mr-2" /> KYC Link
              </Button>
              {canEditChecklist && client.onboarding_status !== "activated" && (
                <Button size="sm" onClick={activateClient} disabled={activating}>
                  <CheckCircle2 className="size-4 mr-2" />
                  {activating ? "Activating…" : "Activate client"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <div className="overflow-x-auto">
          <TabsList className="flex w-max min-w-full sm:w-auto">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist {checklist.length > 0 && `(${completedChecklist}/${checklist.length})`}
            </TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="engagements">Engagements</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </div>

        {/* Profile tab */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <DetailRow label="Client Code" value={client.client_code} />
                <DetailRow label="Legal Name" value={client.name} />
                <DetailRow label="Trade Name" value={client.trade_name} />
                <DetailRow label="Entity Type" value={client.entity_type_label} />
                <DetailRow label="Contact Person" value={client.contact_person} />
                <DetailRow label="Email" value={client.contact_email} />
                <DetailRow label="Phone" value={client.contact_phone} />
                <DetailRow label="PAN" value={client.pan ? `••••••${client.pan.slice(-4)}` : "—"} />
                <DetailRow label="GSTIN" value={client.gstin} />
                <DetailRow label="Address" value={client.address} />
                <DetailRow label="Partner in Charge" value={client.partner_name ?? "—"} />
                <DetailRow label="Client Group" value={client.group_name ?? "—"} />
                <DetailRow
                  label="Financial year ends in"
                  value={
                    canEditChecklist ? (
                      <select
                        aria-label="Financial year ends in"
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                        value={String(client.financial_year_end_month ?? 3)}
                        disabled={savingFy}
                        onChange={(e) => saveFyMonth(e.target.value)}
                      >
                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, i) => (
                          <option key={name} value={String(i + 1)}>
                            {name}{i === 2 ? " (Indian financial year)" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][(client.financial_year_end_month ?? 3) - 1]
                    )
                  }
                />
                <DetailRow label="Status" value={STATUS_LABELS[client.onboarding_status]} />
                {client.notes && <DetailRow label="Notes" value={client.notes} />}
              </dl>
            </CardContent>
          </Card>
          <div className="mt-4">
            <ClientSubmissionCard
              submission={(client as unknown as { onboarding_submission?: ClientSubmission | null }).onboarding_submission}
            />
            <ImportedDetailsCard extras={client.extra_details} />
          </div>
        </TabsContent>

        {/* Checklist tab */}
        <TabsContent value="checklist" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Onboarding Checklist</CardTitle>
                <Badge variant={checklistPct === 100 ? "default" : "secondary"}>
                  {completedChecklist}/{checklist.length}
                </Badge>
              </div>
              {checklist.length > 0 && <Progress value={checklistPct} className="h-2 mt-2" />}
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground px-3 pb-2">
                All nine items must be complete before the client can be activated. The Managing Partner can override
                an item with a written reason.
              </p>
              {checklist.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading the checklist…</p>
              )}
              {checklist.map((item) => (
                <div
                  key={item.checklist_item_code}
                  className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5 hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    {item.kind === "manual" && canEditChecklist ? (
                      <button
                        type="button"
                        aria-label={item.is_complete ? `Untick ${item.label}` : `Tick ${item.label}`}
                        disabled={busyCode === item.checklist_item_code}
                        onClick={() => toggleItem(item.checklist_item_code, !item.is_complete)}
                        className="mt-0.5 shrink-0 disabled:opacity-50"
                      >
                        {item.is_complete
                          ? <CheckCircle2 className="size-4 text-green-600" />
                          : <Circle className="size-4 text-muted-foreground" />}
                      </button>
                    ) : item.is_complete ? (
                      <CheckCircle2 className="size-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className={`text-sm ${item.is_complete ? "text-muted-foreground" : "text-foreground"}`}>
                        {item.label}
                      </span>
                      {item.kind === "auto" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.is_complete
                            ? "A Partner in Charge is set on this client."
                            : "Set the Partner in Charge on the client record."}
                        </p>
                      )}
                      {item.kind === "conflict" && item.is_complete && item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                      )}
                      {item.kind === "conflict" && !item.is_complete && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {canRecordConflict
                            ? "Use Conflict Check above to run it and record the result."
                            : "A Partner records this using Conflict Check."}
                        </p>
                      )}
                      {item.kind === "manual" && item.is_complete && item.completed_by_name && !item.override_justification && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ticked by {item.completed_by_name}
                          {item.completed_at ? ` on ${new Date(item.completed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                        </p>
                      )}
                      {item.override_justification && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Managing Partner override: {item.override_justification}
                        </p>
                      )}
                    </div>
                  </div>
                  {!item.is_complete && canOverrideChecklist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 shrink-0"
                      onClick={() => { setOverrideItem(item); setOverrideOpen(true); }}
                    >
                      MP Override
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="mt-4 space-y-6">
          <p className="text-sm text-muted-foreground">
            Papers about the client itself, such as PAN, GST certificate and KYC, go here. Work files for a job go on that job&apos;s page.
          </p>
          <FilingCabinet clientId={client.id} />
          <DocumentVault ownerType="client" ownerId={client.id} title="Client Documents" />
        </TabsContent>

        {/* Engagements tab */}
        <TabsContent value="engagements" className="mt-4">
          <ClientEngagementsTab clientId={client.id} />
        </TabsContent>

        {/* Tasks tab */}
        <TabsContent value="tasks" className="mt-4">
          <ClientTasksTab clientId={client.id} />
        </TabsContent>

        {/* Billing tab */}
        <TabsContent value="billing" className="mt-4">
          <ClientBillingTab clientId={client.id} />
        </TabsContent>

        {/* Timeline tab */}
        <TabsContent value="timeline" className="mt-4">
          <ClientActivityTimeline
            clientId={client.id}
            createdAt={client.created_at}
            statusLabel={STATUS_LABELS[client.onboarding_status] ?? client.onboarding_status}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ConflictCheckDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        result={conflictResult}
        canRecord={canRecordConflict}
        recording={recordingConflict}
        onRecord={recordConflict}
      />

      {overrideItem && (
        <OnboardingOverrideDialog
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          clientId={client.id}
          itemCode={overrideItem.checklist_item_code}
          itemLabel={overrideItem.label}
          onOverridden={loadChecklist}
        />
      )}
    </div>
  );
}
