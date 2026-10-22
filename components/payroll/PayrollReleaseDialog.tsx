"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ReadinessRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_id_code: string;
  salary_status: string;
  task_completion_pct: number | null;
  open_blocking_items: number;
  released_by: string | null;
  released_at: string | null;
  notes: string | null;
  pending_acceptance?: number | null;
  gross_amount?: number | null;
}

interface PayrollReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ReadinessRecord | null;
  onReleased: () => void;
}

/**
 * FR-15 / FR-61: the Managing Partner releases a salary. Release is only
 * possible when the employee is Ready — there is no override (AC-7).
 */
export function PayrollReleaseDialog({
  open,
  onOpenChange,
  record,
  onReleased,
}: PayrollReleaseDialogProps) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!record) return null;

  const isReady = record.salary_status === "ready";
  const completionPct =
    record.task_completion_pct != null ? Math.round(Number(record.task_completion_pct) * 100) : 0;
  const pending = record.pending_acceptance ?? 0;

  async function handleRelease() {
    if (!record) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll-readiness/${record.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || data.error || "Release failed");
        onReleased(); // refresh — the status may have changed
        return;
      }
      toast.success(`Salary released for ${record.employee_name}`);
      onReleased();
      onOpenChange(false);
      setNotes("");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Release Salary</DialogTitle>
          <DialogDescription>
            Release this employee&apos;s salary for the selected month. Once released, the record
            is locked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{record.employee_name}</span>
              <Badge variant="outline" className="text-xs">{record.employee_id_code}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Completion</span>
                <div className="font-medium">{completionPct}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Blocking</span>
                <div className="font-medium">{record.open_blocking_items}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Awaiting acceptance</span>
                <div className="font-medium">{pending}</div>
              </div>
            </div>
            {record.gross_amount != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Amount </span>
                <span className="font-medium">
                  ₹{Number(record.gross_amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </div>

          {isReady ? (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <CheckCircle2 className="size-5 shrink-0 text-green-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Ready for release</p>
                <p className="text-muted-foreground mt-1">
                  Every task is completed or has a partner-accepted reason.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Not ready for release</p>
                <p className="text-muted-foreground mt-1">
                  Salary can only be released when the status is Ready. Action the open items in
                  the Reason register first.
                </p>
              </div>
            </div>
          )}

          {isReady && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="release-notes">Notes (optional)</Label>
              <Textarea
                id="release-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any release notes..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {isReady ? "Cancel" : "Close"}
          </Button>
          {isReady && (
            <Button onClick={handleRelease} disabled={loading}>
              {loading ? "Releasing…" : "Confirm Release"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
