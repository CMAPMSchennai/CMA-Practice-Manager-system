"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * One small switch for the Managing Partner and Admin, shown on the Services page itself
 * (Gap #31, added feature): whether Managers see the standard fee. Hidden from everyone else.
 */
export function ManagerFeeSwitch() {
  const [managersSeeFees, setManagersSeeFees] = useState(false);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/visibility")
      .then((r) => r.json())
      .then((j) => {
        setManagersSeeFees(!!j?.settings?.managers_see_standard_fees);
        setCanEdit(!!j?.can_edit);
      })
      .catch(() => setCanEdit(false));
  }, []);

  if (!canEdit) return null;

  async function change(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managers_see_standard_fees: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Could not save.");
        return;
      }
      setManagersSeeFees(next);
      toast.success(next ? "Managers can now see standard fees." : "Managers can no longer see standard fees.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <Switch id="managers-fees" checked={managersSeeFees} disabled={saving} onCheckedChange={change} />
      <Label htmlFor="managers-fees" className="text-sm font-normal cursor-pointer">
        Managers can see standard fees
      </Label>
    </div>
  );
}
