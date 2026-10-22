"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** The firm's confidentiality undertaking text (FR-39). Only the Managing Partner can change it. */
export function UndertakingCard() {
  const [info, setInfo] = useState<{ text: string; is_placeholder: boolean; can_edit: boolean } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/settings/undertaking")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text: string; is_placeholder: boolean; can_edit: boolean } | null) => {
        setInfo(d);
        setText(d && !d.is_placeholder ? d.text : "");
      })
      .catch(() => {});
  }
  useEffect(load, []);

  if (!info) return null;

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/settings/undertaking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "Could not save the text.");
        return;
      }
      toast.success("Undertaking text saved.");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Staff confidentiality undertaking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {info.is_placeholder ? (
          <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
            The firm&apos;s wording has not been entered yet. Until it is, staff can&apos;t accept the undertaking on the onboarding form.
          </p>
        ) : (
          <p className="text-muted-foreground">This text is shown to staff on the onboarding form. A copy is stored with each person&apos;s acceptance.</p>
        )}
        {info.can_edit ? (
          <>
            <textarea
              aria-label="Undertaking text"
              rows={10}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the firm's full confidentiality undertaking here."
            />
            <Button onClick={save} disabled={busy || text.trim().length < 40}>
              {busy ? "Saving…" : "Save text"}
            </Button>
            <p className="text-xs text-muted-foreground">Changing the text does not change what people have already accepted.</p>
          </>
        ) : (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3">{info.text}</div>
        )}
      </CardContent>
    </Card>
  );
}
