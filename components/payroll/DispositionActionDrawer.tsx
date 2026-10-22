"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface Disposition {
  id: string;
  task_instance_id: string;
  reason_id: string;
  reason_label: string | null;
  reason_code?: string | null;
  free_text: string | null;
  logged_by: string;
  logged_at: string;
  disposition_action: string | null;
  disposition_notes: string | null;
  dispositioned_by: string | null;
  dispositioned_at: string | null;
  task_title: string | null;
  engagement_id: string | null;
  created_at: string;
  client_name?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  dispositioned_by_name?: string | null;
  days_late?: number | null;
}

interface Assignee {
  user_id: string;
  name: string;
  employee_id_code: string;
}

type Action = "accept" | "counsel" | "reassign" | "escalate" | "approve_handover";

/** FR-59/60 partner actions; values match the database. */
const DISPOSITION_ACTIONS: { value: Action; label: string; description: string }[] = [
  { value: "accept", label: "Accept reason", description: "Genuine client-side delay — clears the payroll block" },
  { value: "counsel", label: "Counsel staff", description: "Block stays — a performance note is recorded" },
  { value: "reassign", label: "Reassign", description: "Move the task now — original assignee stays blocked until handover is approved" },
  { value: "escalate", label: "Escalate to client", description: "Client-side delay escalated — clears the block, noted on the client timeline" },
  { value: "approve_handover", label: "Approve handover", description: "Task no longer counts against the original assignee" },
];

const HANDOVER_REASON_CODE = "DR-06";

interface DispositionActionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disposition: Disposition | null;
  onDispositioned: () => void;
}

export function DispositionActionDrawer({
  open,
  onOpenChange,
  disposition,
  onDispositioned,
}: DispositionActionDrawerProps) {
  const [action, setAction] = useState<Action | "">("");
  const [notes, setNotes] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);

  const isHandoverItem = disposition?.reason_code === HANDOVER_REASON_CODE;
  const availableActions = DISPOSITION_ACTIONS.filter((a) =>
    a.value === "approve_handover" ? isHandoverItem : a.value !== "reassign" || !isHandoverItem,
  );

  useEffect(() => {
    setAction("");
    setNotes("");
    setNewAssigneeId("");
  }, [disposition?.id]);

  useEffect(() => {
    if (action !== "reassign" || assignees.length > 0) return;
    fetch("/api/task-assignees")
      .then((r) => r.json())
      .then((data: { assignees?: Assignee[]; error?: string }) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setAssignees(data.assignees ?? []);
      })
      .catch(() => toast.error("Failed to load staff"));
  }, [action, assignees.length]);

  if (!disposition) return null;

  const reassignChoices = assignees.filter((a) => a.user_id !== disposition.assignee_id);
  const canSubmit =
    !!action &&
    !loading &&
    (action !== "counsel" || notes.trim().length > 0) &&
    (action !== "reassign" || !!newAssigneeId);

  async function handleSubmit() {
    if (!disposition || !action) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/delay-reason-dispositions/${disposition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: notes.trim() || undefined,
          new_assignee_id: action === "reassign" ? newAssigneeId : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || "Failed to record the action");
        return;
      }
      toast.success(
        action === "reassign"
          ? "Task reassigned — a handover item is now awaiting your approval"
          : "Action recorded",
      );
      onDispositioned();
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const loggedOn = new Date(disposition.logged_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Partner action</SheetTitle>
          <SheetDescription>
            Decide how this delay affects the employee&apos;s salary release.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          <div className="rounded-md border p-4 flex flex-col gap-3">
            <div>
              <span className="text-xs font-medium text-muted-foreground">Task</span>
              <p className="text-sm font-medium">{disposition.task_title || "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Client</span>
                <p className="text-sm">{disposition.client_name || "—"}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Employee</span>
                <p className="text-sm">{disposition.assignee_name || "—"}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Days late</span>
                <p className="text-sm">{disposition.days_late ?? "—"}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Logged</span>
                <p className="text-sm">{loggedOn}</p>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground">Reason</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">
                  {disposition.reason_code ? `${disposition.reason_code} · ` : ""}
                  {disposition.reason_label || "Unknown"}
                </Badge>
              </div>
            </div>
            {disposition.free_text && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">Details</span>
                <p className="text-sm">{disposition.free_text}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="partner-action">Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger id="partner-action">
                <SelectValue placeholder="Select an action" />
              </SelectTrigger>
              <SelectContent>
                {availableActions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <div>
                      <div className="font-medium">{a.label}</div>
                      <div className="text-xs text-muted-foreground">{a.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {action === "reassign" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-assignee">Reassign to</Label>
              <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                <SelectTrigger id="new-assignee">
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {reassignChoices.map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.name} ({a.employee_id_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reassignChoices.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No other onboarded staff are available to take this task.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="partner-notes">
              {action === "counsel" ? "Performance note (required)" : "Notes"}
            </Label>
            <Textarea
              id="partner-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                action === "counsel"
                  ? "What was discussed with the staff member…"
                  : "Optional notes…"
              }
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
              {loading ? "Saving…" : "Record action"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
