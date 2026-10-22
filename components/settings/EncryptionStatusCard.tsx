"use client";

import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Status {
  state: "active" | "missing" | "invalid";
  length: number | null;
}

/**
 * Shows whether field-level encryption of PAN, Aadhaar, bank and salary is
 * active (NFR), and why not when it isn't. Hidden for roles without manage_settings.
 */
export function EncryptionStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/settings/encryption-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Partial<Status> | null) => {
        if (data && (data.state === "active" || data.state === "missing" || data.state === "invalid")) {
          setStatus({ state: data.state, length: data.length ?? null });
        }
      })
      .catch(() => {});
  }, []);

  if (!status) return null;
  const active = status.state === "active";

  const detail = active
    ? "PAN, Aadhaar, bank account and salary are encrypted before they are saved."
    : status.state === "missing"
      ? "The app can't see an encryption key yet. PAN, Aadhaar, bank account and salary can't be saved until it is added and the app has restarted."
      : `An encryption key reached the app but isn't valid (${status.length} characters; a valid key is exactly 44 characters ending in "="). Check it has no quotes or extra spaces.`;

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        {active ? (
          <Lock className="size-5 text-accent shrink-0 mt-0.5" />
        ) : (
          <LockOpen className="size-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Data encryption</p>
            <Badge variant={active ? "default" : "outline"}>
              {active ? "Active" : status.state === "missing" ? "Key not found" : "Key invalid"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
