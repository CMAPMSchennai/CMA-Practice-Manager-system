"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BoardTask {
  id: string;
  step_code: string;
  title: string;
  description?: string | null;
  library_area_name: string;
  library_subtask_name: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  reviewer: string | null;
  assigned_to_name: string | null;
  reviewer_name: string | null;
  due_date: string | null;
  planned_start_date?: string | null;
  observations?: string | null;
  actions: string[];
  can_assign: boolean;
  is_assignee: boolean;
  is_reviewer: boolean;
}

interface Person {
  user_id: string;
  name: string;
  detail?: string;
}
interface LoggedReason {
  id: string;
  reason_label: string | null;
  free_text: string | null;
  logged_by_name: string | null;
  logged_at: string;
  disposition_action: string | null;
  disposition_notes: string | null;
  dispositioned_by_name: string | null;
}
const ACTION_WORDS: Record<string, string> = {
  accept: "Reason accepted",
  counsel: "Staff counselled",
  reassign: "Reassigned",
  escalate: "Escalated to client",
  approve_handover: "Handover approved",
};
interface DelayReason {
  id: string;
  code: string;
  label: string;
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  under_review: "Under review",
  returned: "Returned",
  blocked: "Blocked",
  completed: "Completed",
  not_applicable: "Not applicable",
};

/** Colour meaning of each task status (UI Version 3). */
export const TASK_STATUS_TONES: Record<string, StatusTone> = {
  not_started: "neutral",
  in_progress: "calm",
  under_review: "warn",
  returned: "urgent",
  blocked: "urgent",
  completed: "ok",
  not_applicable: "neutral",
};

/** What each button is called, by the status it moves the task to. */
function actionLabel(from: string, to: string): string {
  if (to === "in_progress") return from === "not_started" ? "Start" : "Resume";
  if (to === "under_review") return "Submit for review";
  if (to === "blocked") return "Mark blocked";
  if (to === "completed") return "Approve and complete";
  if (to === "returned") return "Return to doer";
  if (to === "not_applicable") return "Mark not applicable";
  return to;
}

function isOverdue(task: BoardTask): boolean {
  if (!task.due_date || task.status === "completed" || task.status === "not_applicable") return false;
  const due = new Date(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

const NONE = "none";

/** What the viewer can do next, in words, when no button applies. */
function waitingNote(task: BoardTask): string | null {
  if (task.actions.length > 0) return null;
  if (task.status === "under_review") {
    if (task.is_assignee) return `Waiting for ${task.reviewer_name ?? "the reviewer"} to review your work. You can't approve your own work.`;
    return `Waiting for ${task.reviewer_name ?? "the reviewer"} to review.`;
  }
  if (task.status === "completed") return "This task is complete.";
  if (task.status === "not_applicable") return "This task was marked not applicable.";
  if (!task.assigned_to) return "No one is assigned to this task yet.";
  return `Assigned to ${task.assigned_to_name ?? "someone else"}. Only they, or a manager, can move it forward.`;
}

/**
 * One task: who is doing it and who reviews it, and the actions this user may
 * take (FR-50, FR-51). The buttons come from the server, which applies the same
 * rules when the action is taken, so a doer is never offered "Approve".
 */
export function TaskPanel({
  task,
  onClose,
  onChanged,
}: {
  task: BoardTask | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [doer, setDoer] = useState(NONE);
  const [reviewer, setReviewer] = useState(NONE);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [planned, setPlanned] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [blocked, setBlocked] = useState<{ name: string; reason: string }[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [reviewers, setReviewers] = useState<Person[]>([]);
  const [reasons, setReasons] = useState<DelayReason[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState<LoggedReason[]>([]);
  const [activity, setActivity] = useState<{ id: string; at: string; by: string | null; text: string }[]>([]);

  const taskId = task?.id;
  const canAssign = task?.can_assign ?? false;

  useEffect(() => {
    if (!task) return;
    setDoer(task.assigned_to ?? NONE);
    setReviewer(task.reviewer ?? NONE);
    setNote(task.observations ?? "");
    setDue(task.due_date ? String(task.due_date).slice(0, 10) : "");
    setPlanned(task.planned_start_date ? String(task.planned_start_date).slice(0, 10) : "");
    setReasonId("");
    setReasonText("");
    setActivity([]);
    fetch(`/api/task-instances/${task.id}/activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { events?: { id: string; at: string; by: string | null; text: string }[] } | null) =>
        setActivity(d?.events ?? []),
      )
      .catch(() => {});
    setLogged([]);
    fetch(`/api/delay-reason-dispositions?task_instance_id=${task.id}`)
      .then((r) => r.json())
      .then((d: { dispositions?: LoggedReason[] }) => setLogged(d.dispositions ?? []))
      .catch(() => {});
    // Only what this person can use is loaded.
    if (task.can_assign) {
      fetch("/api/task-assignees?diagnose=1")
        .then((r) => r.json())
        .then(
          (d: {
            assignees?: { user_id: string; name: string; employee_id_code: string }[];
            blocked?: { name: string; reason: string }[];
          }) => {
            setPeople((d.assignees ?? []).map((a) => ({ user_id: a.user_id, name: a.name, detail: a.employee_id_code })));
            setBlocked(d.blocked ?? []);
            setPeopleLoaded(true);
          },
        )
        .catch(() => setPeopleLoaded(true));
      fetch("/api/task-assignees?for=reviewer")
        .then((r) => r.json())
        .then((d: { reviewers?: { user_id: string; name: string; role: string }[] }) =>
          setReviewers((d.reviewers ?? []).map((a) => ({ user_id: a.user_id, name: a.name, detail: a.role.replace(/_/g, " ") }))),
        )
        .catch(() => {});
    }
    if (isOverdue(task)) {
      fetch("/api/reference-data?type=delay_reason")
        .then((r) => r.json())
        .then((d: { reference_data?: DelayReason[] }) => setReasons(d.reference_data ?? []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) return null;

  const overdue = isOverdue(task);
  const reason = reasons.find((r) => r.id === reasonId);
  const needsFreeText = reason?.code === "DR-08";
  const canPickDoer = canAssign && (!task.assigned_to || task.status === "not_started");

  async function patch(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/task-instances/${task!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || "That didn't work");
        return false;
      }
      toast.success(success);
      onChanged();
      return true;
    } catch {
      toast.error("That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    const body: Record<string, unknown> = {};
    if (canPickDoer && (doer === NONE ? null : doer) !== task!.assigned_to) body.assigned_to = doer === NONE ? null : doer;
    if ((reviewer === NONE ? null : reviewer) !== task!.reviewer) body.reviewer = reviewer === NONE ? null : reviewer;
    if (due !== (task!.due_date ? String(task!.due_date).slice(0, 10) : "")) body.due_date = due || null;
    if (planned !== (task!.planned_start_date ? String(task!.planned_start_date).slice(0, 10) : "")) body.planned_start_date = planned || null;
    if (!Object.keys(body).length) {
      toast.info("Nothing to change");
      return;
    }
    if ((body.assigned_to ?? task!.assigned_to) && (body.assigned_to ?? task!.assigned_to) === (body.reviewer ?? task!.reviewer)) {
      toast.error("The reviewer must be a different person from the doer");
      return;
    }
    await patch(body, "Assignment saved");
  }

  async function act(to: string) {
    if (overdue) {
      if (!reasonId) {
        toast.error("This task is overdue. Choose a delay reason first.");
        return;
      }
      if (needsFreeText && !reasonText.trim()) {
        toast.error("Describe the reason for \"Other\"");
        return;
      }
    }
    const body: Record<string, unknown> = { status: to };
    if (overdue) {
      body.delay_reason_id = reasonId;
      if (reasonText.trim()) body.free_text = reasonText.trim();
    }
    if (note.trim() !== (task!.observations ?? "").trim()) body.observations = note.trim();
    const ok = await patch(body, to === "completed" ? "Task completed" : "Task updated");
    if (ok) onClose();
  }

  async function saveNote() {
    await patch({ observations: note.trim() }, "Note saved");
  }

  const nameOf = (id: string | null, fallback: string | null) => (id ? fallback ?? "Unknown" : "Not assigned");
  const waiting = waitingNote(task);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">{task.title}</DialogTitle>
          <DialogDescription>
            {task.step_code} · {task.library_area_name}
            {task.library_subtask_name && task.library_subtask_name !== task.library_area_name
              ? ` › ${task.library_subtask_name}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={overdue && task.status !== "completed" ? "over" : TASK_STATUS_TONES[task.status] ?? "neutral"}>
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </StatusChip>
          <Badge variant="outline">{task.priority}</Badge>
          {task.due_date && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Due {new Date(task.due_date).toLocaleDateString("en-IN", { timeZone: "UTC" })}
              {overdue ? " · overdue" : ""}
            </span>
          )}
        </div>

        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}

        {/* Who */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-doer">Doer</Label>
            {canPickDoer ? (
              <Select value={doer} onValueChange={setDoer}>
                <SelectTrigger id="task-doer">
                  <SelectValue placeholder="Choose a doer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.name} {p.detail ? `(${p.detail})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p id="task-doer" className="text-sm font-medium text-foreground">
                {nameOf(task.assigned_to, task.assigned_to_name)}
                {task.is_assignee ? " (you)" : ""}
              </p>
            )}
            {canAssign && !canPickDoer && (
              <p className="text-xs text-muted-foreground">
                Work has started. To move it to someone else, use Reassign on the Payroll page so the handover is recorded.
              </p>
            )}
            {canPickDoer && peopleLoaded && blocked.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>{people.length === 0 ? "No one can be assigned yet." : "Not in the list yet:"}</p>
                <ul className="list-disc pl-4">
                  {blocked.slice(0, 8).map((b) => (
                    <li key={b.name}>
                      {b.name}: {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-reviewer">Reviewer</Label>
            {canAssign ? (
              <Select value={reviewer} onValueChange={setReviewer}>
                <SelectTrigger id="task-reviewer">
                  <SelectValue placeholder="Choose a reviewer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {reviewers.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.name} {p.detail ? `(${p.detail})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p id="task-reviewer" className="text-sm font-medium text-foreground">
                {nameOf(task.reviewer, task.reviewer_name)}
                {task.is_reviewer ? " (you)" : ""}
              </p>
            )}
          </div>
        </div>
        {canAssign && (
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5 max-w-[220px]">
              <Label htmlFor="task-planned">Planned start</Label>
              <input
                id="task-planned"
                type="date"
                value={planned}
                onChange={(e) => setPlanned(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              />
            </div>
            <div className="space-y-1.5 max-w-[220px]">
              <Label htmlFor="task-due">Due date</Label>
              <input
                id="task-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              />
            </div>
          </div>
        )}
        {!canAssign && task.planned_start_date && (
          <p className="text-xs text-muted-foreground">
            Planned start {new Date(task.planned_start_date).toLocaleDateString("en-IN", { timeZone: "UTC" })}
          </p>
        )}
        {canAssign && (
          <div>
            <Button variant="outline" size="sm" onClick={saveAssignment} disabled={busy}>
              <ShieldCheck className="size-4 mr-1" />
              Save assignment and dates
            </Button>
          </div>
        )}

        {logged.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Delay reasons logged</p>
            <ul className="space-y-2 text-sm">
              {logged.map((l) => (
                <li key={l.id}>
                  <span className="font-medium">{l.reason_label ?? "Reason"}</span>
                  {l.free_text ? ` — ${l.free_text}` : ""}
                  <div className="text-xs text-muted-foreground">
                    Logged by {l.logged_by_name ?? "unknown"} on{" "}
                    {new Date(l.logged_at).toLocaleDateString("en-IN")}
                    {l.disposition_action
                      ? ` · ${ACTION_WORDS[l.disposition_action] ?? l.disposition_action}${l.dispositioned_by_name ? ` by ${l.dispositioned_by_name}` : ""}`
                      : " · awaiting partner action"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="task-note">Observations</Label>
          <Textarea
            id="task-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={task.is_reviewer ? "Comments for the doer (sent with Return)" : "Notes on this step"}
          />
          {note.trim() !== (task.observations ?? "").trim() && (
            <Button variant="ghost" size="sm" onClick={saveNote} disabled={busy}>
              Save note
            </Button>
          )}
        </div>

        {/* Delay reason */}
        {overdue && task.actions.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
              <AlertTriangle className="size-4" />
              This task is overdue. A delay reason is required to change its status.
            </p>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger aria-label="Delay reason">
                <SelectValue placeholder="Choose a delay reason" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsFreeText && (
              <Textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={2}
                placeholder="Describe the reason"
                aria-label="Describe the reason"
              />
            )}
          </div>
        )}

        {/* Actions */}
        {task.actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {task.actions.map((to) => (
              <Button
                key={to}
                variant={to === "completed" || to === "under_review" || to === "in_progress" ? "default" : "outline"}
                onClick={() => act(to)}
                disabled={busy}
              >
                {to === "completed" && <CheckCircle2 className="size-4 mr-1" />}
                {to === "returned" && <RotateCcw className="size-4 mr-1" />}
                {actionLabel(task.status, to)}
              </Button>
            ))}
          </div>
        ) : (
          waiting && <p className="text-sm text-muted-foreground">{waiting}</p>
        )}
        {task.status === "in_progress" && !task.reviewer && task.actions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            To submit for review, a reviewer (other than the doer) must be assigned first.
          </p>
        )}
        {activity.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Activity</p>
            <ul className="space-y-1.5">
              {activity.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-foreground">{e.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.by ? ` · by ${e.by}` : ""} ·{" "}
                    {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
