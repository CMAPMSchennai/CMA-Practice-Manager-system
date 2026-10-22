"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

interface Person {
  user_id: string;
  name: string;
  detail?: string;
}
const NONE = "none";

/**
 * FR-50: give a whole Area (every step in it) to one doer, and optionally one
 * reviewer, in a single action. Steps already started keep their doer; single
 * steps can still be changed one by one from the task panel.
 */
export function AreaAssignDialog({
  open,
  onClose,
  engagementId,
  areas,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  engagementId: string;
  areas: { name: string; total: number; unstarted: number }[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [doer, setDoer] = useState("");
  const [reviewer, setReviewer] = useState(NONE);
  const [people, setPeople] = useState<Person[]>([]);
  const [reviewers, setReviewers] = useState<Person[]>([]);
  const [blocked, setBlocked] = useState<{ name: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setDoer("");
    setReviewer(NONE);
    fetch("/api/task-assignees?diagnose=1")
      .then((r) => r.json())
      .then((d) => {
        setPeople(
          ((d.assignees ?? []) as { user_id: string; name: string; employee_id_code: string }[]).map((a) => ({
            user_id: a.user_id,
            name: a.name,
            detail: a.employee_id_code,
          })),
        );
        setBlocked(d.blocked ?? []);
      })
      .catch(() => {});
    fetch("/api/task-assignees?for=reviewer")
      .then((r) => r.json())
      .then((d) =>
        setReviewers(
          ((d.reviewers ?? []) as { user_id: string; name: string; role: string }[]).map((a) => ({
            user_id: a.user_id,
            name: a.name,
            detail: a.role.replace(/_/g, " "),
          })),
        ),
      )
      .catch(() => {});
  }, [open]);

  const chosenAreas = areas.filter((a) => picked.includes(a.name));
  const chosenUnstarted = chosenAreas.reduce((n, a) => n + a.unstarted, 0);
  const chosenTotal = chosenAreas.reduce((n, a) => n + a.total, 0);
  const allPicked = areas.length > 0 && picked.length === areas.length;
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  async function submit() {
    if (picked.length === 0 || !doer) {
      toast.error("Choose at least one area and a doer");
      return;
    }
    if (reviewer !== NONE && reviewer === doer) {
      toast.error("The reviewer must be a different person from the doer");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/task-instances/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engagement_id: engagementId,
          area_names: picked,
          assigned_to: doer,
          ...(reviewer !== NONE ? { reviewer } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.message || d.error || "That didn't work");
        return;
      }
      const doerName = people.find((p) => p.user_id === doer)?.name ?? "the doer";
      const reviewerName = reviewers.find((p) => p.user_id === reviewer)?.name;
      toast.success(
        `${d.updated_count} step(s) assigned to ${doerName}${reviewerName ? `, reviewer ${reviewerName}` : ", no reviewer set"}${d.skipped_count ? `. ${d.skipped_count} already started were left as they are` : ""}`,
      );
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign whole areas</DialogTitle>
          <DialogDescription>
            Gives every step in the areas you tick to one doer in one go. Steps that have already started keep their
            current doer. You can still change single steps afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Areas (tick one or more)</Label>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="underline text-muted-foreground hover:text-foreground"
                  onClick={() => setPicked(allPicked ? [] : areas.map((a) => a.name))}
                >
                  {allPicked ? "Clear all" : "Select all"}
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y" role="group" aria-label="Areas">
              {areas.map((a) => (
                <label key={a.name} className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.includes(a.name)}
                    onChange={() => toggle(a.name)}
                  />
                  <span className="flex-1">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.unstarted} of {a.total} not started
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {picked.length === 0
                ? "No area chosen yet."
                : `${picked.length} area${picked.length === 1 ? "" : "s"} chosen: ${chosenUnstarted} of ${chosenTotal} steps will be assigned.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="area-doer">Doer</Label>
            <Select value={doer} onValueChange={setDoer}>
              <SelectTrigger id="area-doer">
                <SelectValue placeholder="Choose a doer" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.name} {p.detail ? `(${p.detail})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blocked.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {people.length === 0 ? "No one can be assigned yet. " : ""}
                Not in the list: {blocked.slice(0, 5).map((b) => `${b.name} (${b.reason})`).join("; ")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="area-reviewer">Reviewer (optional)</Label>
            <Select value={reviewer} onValueChange={setReviewer}>
              <SelectTrigger id="area-reviewer">
                <SelectValue placeholder="Choose a reviewer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Keep current reviewers</SelectItem>
                {reviewers.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.name} {p.detail ? `(${p.detail})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {picked.length > 0 && chosenUnstarted === 0 && (
            <p className="text-xs text-amber-700">Every step in the chosen area(s) has already started, so nothing will change.</p>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || picked.length === 0 || !doer}>
            {busy ? "Assigning…" : picked.length > 1 ? `Assign ${picked.length} areas` : "Assign area"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
