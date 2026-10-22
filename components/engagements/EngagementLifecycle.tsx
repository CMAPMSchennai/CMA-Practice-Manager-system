"use client";

/**
 * Activate, hold, resume, complete, reopen and cancel an engagement (Gap #65).
 * The buttons shown depend on the engagement's status and on the person's role;
 * the server enforces the same rules.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface LifecycleEngagement {
  id: string;
  status: string;
  can_manage?: boolean;
  can_partner?: boolean;
  is_mp?: boolean;
}

type Ask = { kind: "cancel" } | { kind: "complete_override"; message: string } | null;

export function EngagementLifecycle({
  engagement,
  onChanged,
}: {
  engagement: LifecycleEngagement;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState("");
  const s = engagement.status === "in_progress" ? "active" : engagement.status;

  async function act(action: string, extra?: { reason?: string; override?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (action === "complete" && json.open_tasks && engagement.is_mp && !extra?.override) {
          setReason("");
          setAsk({ kind: "complete_override", message: json.error });
        } else {
          toast.error(json.error ?? "That didn't work. Please try again.");
        }
        return;
      }
      const words: Record<string, string> = {
        activate: "Engagement activated.",
        hold: "Engagement put on hold.",
        resume: "Engagement resumed.",
        complete: "Engagement marked complete. It is now ready to bill.",
        reopen: "Engagement reopened.",
        cancel: "Engagement cancelled.",
      };
      toast.success(words[action] ?? "Done.");
      setAsk(null);
      setReason("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const manage = !!engagement.can_manage;
  const partner = !!engagement.can_partner;
  if (!manage && !partner) return null;

  return (
    <>
      {manage && s === "draft" && (
        <Button size="sm" disabled={busy} onClick={() => act("activate")}>Activate</Button>
      )}
      {manage && s === "active" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("hold")}>Put on hold</Button>
      )}
      {manage && s === "on_hold" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("resume")}>Resume</Button>
      )}
      {partner && (s === "active" || s === "on_hold") && (
        <Button size="sm" disabled={busy} onClick={() => act("complete")}>Mark complete</Button>
      )}
      {partner && s === "completed" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act("reopen")}>Reopen</Button>
      )}
      {partner && ["draft", "active", "on_hold"].includes(s) && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReason(""); setAsk({ kind: "cancel" }); }}>
          Cancel engagement
        </Button>
      )}

      <Dialog open={ask !== null} onOpenChange={(v) => { if (!v) setAsk(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ask?.kind === "cancel" ? "Cancel this engagement?" : "Complete with open tasks?"}</DialogTitle>
            <DialogDescription>
              {ask?.kind === "cancel"
                ? "Its open tasks are closed as not applicable, so they stop counting against anyone's salary readiness. This can't be undone."
                : ask?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{ask?.kind === "cancel" ? "Reason (required)" : "Why is it complete anyway? (required)"}</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAsk(null)}>Back</Button>
            <Button
              disabled={busy || !reason.trim()}
              onClick={() =>
                ask?.kind === "cancel"
                  ? act("cancel", { reason })
                  : act("complete", { reason, override: true })
              }
            >
              {ask?.kind === "cancel" ? "Cancel engagement" : "Complete anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
