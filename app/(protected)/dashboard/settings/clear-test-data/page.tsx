"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = {
  id: string;
  label: string;
  client_name: string | null;
  status: string | null;
  tasks?: number;
  invoices?: number;
  receipts?: number;
  engagements?: number;
  amount?: number;
};

type Kind = "engagements" | "invoices" | "clients" | "expenses" | "documents" | "notifications" | "surnames" | "services";

const TABS: { kind: Kind; title: string; help: string }[] = [
  { kind: "engagements", title: "Engagements", help: "Removes the engagement with its tasks, team and delay reasons. Its invoices are kept and only unlinked." },
  { kind: "invoices", title: "Invoices", help: "Removes the invoice together with its receipts." },
  { kind: "clients", title: "Clients", help: "A client can be removed only when it has no engagements, invoices or receipts left. Remove those first. Search to find any client." },
  { kind: "expenses", title: "Expenses", help: "Removes the expense entry." },
  { kind: "documents", title: "Documents", help: "Removes the registered document details. No file is stored." },
  { kind: "notifications", title: "Notifications", help: "Clears every in-app notification for everyone." },
  { kind: "services", title: "Old service names", help: "Starter service names the app began with. They are not on the firm's workbook list. Ticked ones are hidden from the dropdowns, not deleted. The firm's own services, including Stock Audit, are not listed." },
  { kind: "surnames", title: "Staff surnames", help: "The real workbook gives these staff one name only, but an invented surname from the earlier dummy import is still on their record. The suggested ones are ticked. Clearing leaves the first name as it is." },
];

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

export default function ClearTestDataPage() {
  const [kind, setKind] = React.useState<Kind>("engagements");
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [word, setWord] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const url = `/api/engagements/clear-test-data?kind=${kind}${kind === "clients" && q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, mutate } = useSWR<{ rows: (Row & { n?: number })[] }>(url, fetcher, { shouldRetryOnError: false });

  const tab = TABS.find((t) => t.kind === kind)!;
  const rows = kind === "notifications" ? [] : ((data?.rows ?? []) as Row[]);
  const notes = kind === "notifications" ? Number(data?.rows?.[0]?.n ?? 0) : 0;
  const allPicked = rows.length > 0 && picked.size === rows.length;

  // On the Staff surnames tab the suggested rows start ticked.
  React.useEffect(() => {
    if (kind === "surnames" && data?.rows) {
      setPicked(new Set((data.rows as Row[]).filter((r) => r.status === "suggested").map((r) => r.id)));
    }
    if (kind === "services" && data?.rows) {
      setPicked(new Set((data.rows as Row[]).map((r) => r.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, data?.rows?.length]);

  function switchTab(k: Kind) {
    setKind(k);
    setPicked(new Set());
    setWord("");
    setQ("");
  }

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function run() {
    setBusy(true);
    try {
      const r = await fetch("/api/engagements/clear-test-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ids: [...picked], confirm: word }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "That didn't work.");
      toast.success(`Removed ${j.deleted.length}.`);
      if (j.failed?.length) {
        toast.error(`${j.failed.length} not removed: ${j.failed.map((f: { label: string; error: string }) => `${f.label} (${f.error})`).join("; ")}`);
      }
      setPicked(new Set());
      setWord("");
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="p-4 sm:p-6 lg:p-8 text-sm text-muted-foreground">Only the Managing Partner can use this page.</div>;
  }

  const ready = word === "DELETE" && (kind === "notifications" ? notes > 0 : picked.size > 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clear test data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test-only tool. Removes the records you tick. This cannot be undone. It is switched off before go-live.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.kind} size="sm" variant={t.kind === kind ? "default" : "outline"} onClick={() => switchTab(t.kind)}>
            {t.title}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tab.title}{kind !== "notifications" ? ` (${rows.length})` : ""}</CardTitle>
          <p className="text-sm text-muted-foreground">{tab.help}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {kind === "clients" && (
            <Input placeholder="Search a client by name or code" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          )}

          {kind === "notifications" ? (
            <p>{data ? `${notes} notifications will be cleared.` : "Loading…"}</p>
          ) : !data ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">Nothing to show.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {kind !== "clients" && (
                <label className="flex items-center gap-3 bg-muted px-3 py-2 font-medium">
                  <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />
                  Select all
                </label>
              )}
              {rows.map((r) => (
                <label key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="font-medium">{r.label}</span>
                  <span className="flex-1 text-muted-foreground">{r.client_name ?? ""}</span>
                  {r.status && <span className="text-muted-foreground">{r.status.replace("_", " ")}</span>}
                  {r.tasks !== undefined && <span className="text-muted-foreground">{r.tasks} tasks</span>}
                  {r.amount !== undefined && <span className="text-muted-foreground">₹{Number(r.amount).toLocaleString("en-IN")}</span>}
                  {kind === "clients" && (
                    <span className="text-muted-foreground">
                      {r.engagements ?? 0} engagements, {r.invoices ?? 0} invoices
                    </span>
                  )}
                  {kind === "invoices" && (r.receipts ?? 0) > 0 && <span className="text-amber-800">{r.receipts} receipts go too</span>}
                  {kind === "engagements" && (r.invoices ?? 0) > 0 && <span className="text-amber-800">{r.invoices} invoice links</span>}
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Type DELETE to confirm" value={word} onChange={(e) => setWord(e.target.value)} className="max-w-56" />
            <Button variant="destructive" disabled={busy || !ready} onClick={run}>
              {kind === "notifications" ? "Clear all notifications" : `Remove ${picked.size} selected`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
