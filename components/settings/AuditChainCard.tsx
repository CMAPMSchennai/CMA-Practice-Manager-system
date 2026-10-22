"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Report {
  ok: boolean;
  total: number;
  sealed: number;
  unsealed: number;
  problems: string[];
}

/** Checks that no audit entry has been changed, removed or added behind the app's back (FR-02). */
export function AuditChainCard() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const res = await fetch("/api/audit-logs/verify");
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      const json = await res.json();
      if (res.ok) setReport(json);
    } finally {
      setBusy(false);
    }
  }

  if (denied) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {report && !report.ok ? <ShieldAlert className="size-4 text-destructive" /> : <ShieldCheck className="size-4 text-accent" />}
          Audit trail
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Every action is recorded and chained to the one before it. Checking confirms nothing was changed, removed or added
          outside the app.
        </p>
        {report && (
          <div className={`rounded-md border p-3 text-sm ${report.ok ? "" : "border-destructive/50 bg-destructive/10"}`}>
            <p className="font-medium">{report.ok ? "Intact" : "Problem found"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {report.total} entries · {report.sealed} sealed
              {report.unsealed > 0 ? ` · ${report.unsealed} not yet sealed (they are sealed with the next recorded action)` : ""}
            </p>
            {report.problems.map((p, i) => (
              <p key={i} className="text-xs text-destructive mt-1">{p}</p>
            ))}
          </div>
        )}
        <Button size="sm" variant="outline" onClick={check} disabled={busy}>
          {busy ? "Checking…" : "Check the audit trail"}
        </Button>
      </CardContent>
    </Card>
  );
}
