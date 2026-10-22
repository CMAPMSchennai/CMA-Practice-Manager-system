"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Settings {
  recurring_lead_days: number;
  escalation_days: [number, number, number];
  reminder_days: [number, number, number];
  turnaround_target_days?: number;
  task_due_days?: number;
}

/**
 * Timing for recurring engagements (FR-06) and the escalation ladder (FR-67).
 * Hidden for roles without manage_settings.
 */
export function AutomationCard() {
  const [loaded, setLoaded] = useState(false);
  const [lead, setLead] = useState("7");
  const [steps, setSteps] = useState(["7", "3", "1"]);
  const [reminders, setReminders] = useState(["7", "15", "30"]);
  const [target, setTarget] = useState("5");
  const [dueDays, setDueDays] = useState("15");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/automation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Settings | null) => {
        if (!d) return;
        setLead(String(d.recurring_lead_days));
        setSteps(d.escalation_days.map(String));
        setReminders((d.reminder_days ?? [7, 15, 30]).map(String));
        setTarget(String(d.turnaround_target_days ?? 5));
        setDueDays(String(d.task_due_days ?? 15));
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  if (!loaded) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recurring_lead_days: Number(lead),
          escalation_days: steps.map(Number),
          reminder_days: reminders.map(Number),
          turnaround_target_days: Number(target),
          task_due_days: Number(dueDays),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Couldn't save these settings");
        return;
      }
      setLead(String(d.recurring_lead_days));
      setSteps(d.escalation_days.map(String));
      setReminders((d.reminder_days ?? [7, 15, 30]).map(String));
      setTarget(String(d.turnaround_target_days ?? 5));
      setDueDays(String(d.task_due_days ?? 15));
      toast.success("Timing saved");
    } finally {
      setSaving(false);
    }
  }

  const labels = ["Step 1: the owner", "Step 2: the manager", "Step 3: the partner-in-charge"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Timer className="size-4 text-accent" />
          Reminders and recurring work
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="auto-lead">Create the next period this many days before the current one ends</Label>
          <Input id="auto-lead" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Statutory due dates: days before the due date</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {labels.map((label, i) => (
              <div key={label} className="space-y-1.5">
                <Label htmlFor={`auto-step-${i}`}>{label}</Label>
                <Input
                  id={`auto-step-${i}`}
                  inputMode="numeric"
                  value={steps[i]}
                  onChange={(e) => setSteps(steps.map((s, j) => (j === i ? e.target.value : s)))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The Managing Partner is told on the due date itself. Each step should be the same number of days
            or fewer than the step before it.
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Invoice payment reminders: days after the due date</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {["First reminder", "Second reminder", "Third reminder"].map((label, i) => (
              <div key={label} className="space-y-1.5">
                <Label htmlFor={`auto-rem-${i}`}>{label}</Label>
                <Input
                  id={`auto-rem-${i}`}
                  inputMode="numeric"
                  value={reminders[i]}
                  onChange={(e) => setReminders(reminders.map((s, j) => (j === i ? e.target.value : s)))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A draft reminder is prepared for each overdue invoice at these points. A Partner approves it before it is sent.
          </p>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="auto-target">Target days to finish a task, from starting it</Label>
          <Input id="auto-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
          <p className="text-xs text-muted-foreground">Used on the Tasks page to compare the average turnaround against a target.</p>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="auto-due">Days given to finish a new task</Label>
          <Input id="auto-due" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            A task with no due date gets one on the day a doer is assigned to it: that day plus this many days. Raise it when
            staff are short, lower it when work is tight. Enter 0 to set no date automatically. A person assigning a task can
            still set a different date, and a task that already has a date keeps it.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save timing"}
        </Button>
      </CardContent>
    </Card>
  );
}
