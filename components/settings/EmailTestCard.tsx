"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmailTestCard() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        setResult({ ok: true, text: `Sent. Look in the inbox of ${to.trim()} (and the spam folder).` });
      } else {
        setResult({ ok: false, text: String(json.error ?? "The test failed.") });
      }
    } catch {
      setResult({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sends one plain test message through the connected Gmail account and shows the answer. It creates no login and
          changes no data.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Send the test to this address"
            className="max-w-xs"
            aria-label="Send the test email to"
          />
          <Button size="sm" variant="outline" disabled={busy || !to.trim()} onClick={send}>
            {busy ? "Sending…" : "Send test email"}
          </Button>
        </div>
        {result && (
          <p className={`text-xs whitespace-pre-wrap break-words ${result.ok ? "text-green-700" : "text-red-700"}`}>
            {result.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
