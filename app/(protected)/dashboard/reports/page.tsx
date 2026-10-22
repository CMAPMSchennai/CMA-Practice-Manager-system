"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, FileSpreadsheet, Play, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ColType = "text" | "money" | "number" | "date" | "percent";
interface Column { key: string; label: string; type?: ColType }
interface Table { title?: string; columns: Column[]; rows: Record<string, unknown>[] }
interface Result extends Table { notes?: string[]; extra?: Table[]; report: { id: string; name: string; description: string } }
interface ReportInfo { id: string; name: string; description: string; category: string; uses: string[] }
interface Options {
  reports: ReportInfo[];
  entities: { id: string; name: string; short_code: string }[];
  partners: { id: string; name: string }[];
  groups: { id: string; name: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

function cell(v: unknown, type?: ColType): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "number") return Number(v).toLocaleString("en-IN");
  if (type === "percent") return `${Number(v)}%`;
  if (type === "date") {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return String(v);
}

function DataTable({ t }: { t: Table }) {
  const align = (c: Column) => (c.type === "money" || c.type === "number" || c.type === "percent" ? "text-right tabular-nums" : "text-left");
  return (
    <div className="space-y-2">
      {t.title && <p className="text-sm font-medium">{t.title}</p>}
      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {t.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 font-medium whitespace-nowrap ${align(c)}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.length === 0 && (
              <tr>
                <td colSpan={t.columns.length} className="px-3 py-8 text-center text-muted-foreground">Nothing to show for these filters.</td>
              </tr>
            )}
            {t.rows.map((r, i) => {
              const first = String(r[t.columns[0].key] ?? "");
              const total = first.startsWith("Total") || first.startsWith("All entities");
              return (
                <tr key={i} className={`border-t ${total ? "font-semibold bg-muted/30" : ""}`}>
                  {t.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${align(c)}`}>{cell(r[c.key], c.type)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<ReportInfo | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [entity, setEntity] = useState("all");
  const [partner, setPartner] = useState("all");
  const [group, setGroup] = useState("all");
  const [by, setBy] = useState("client");
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/reports/list")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) toast.error(d.error ?? "The reports could not be loaded.");
        else setOptions(d);
      })
      .catch(() => toast.error("The reports could not be loaded."));
  }, []);

  const query = useMemo(() => {
    if (!selected) return "";
    const p = new URLSearchParams({ report: selected.id, from, to });
    if (selected.uses.includes("entity") && entity !== "all") p.set("entity_id", entity);
    if (selected.uses.includes("partner") && partner !== "all") p.set("partner_id", partner);
    if (selected.uses.includes("group") && group !== "all") p.set("group_id", group);
    if (selected.uses.includes("by")) p.set("by", by);
    return p.toString();
  }, [selected, from, to, entity, partner, group, by]);

  const run = useCallback(async () => {
    if (!query) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/reports/run?${query}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "The report could not be run.");
        setResult(null);
        return;
      }
      setResult(json);
    } catch {
      toast.error("The report could not be run.");
    } finally {
      setRunning(false);
    }
  }, [query]);

  // Choosing a different report shows it straight away.
  useEffect(() => {
    setResult(null);
    if (selected) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const grouped = useMemo(() => {
    const m = new Map<string, ReportInfo[]>();
    for (const r of options?.reports ?? []) m.set(r.category, [...(m.get(r.category) ?? []), r]);
    return Array.from(m.entries());
  }, [options]);

  const uses = (k: string) => selected?.uses.includes(k) ?? false;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="size-6 text-primary" />
          Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-prose">
          Choose a report, set the dates and filters, and run it. Download it as an Excel file, or print it to save as a PDF.
        </p>
      </div>

      {!options && <Skeleton className="h-64 w-full" />}

      {options && (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-4 print:hidden">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{category}</p>
                <div className="space-y-1">
                  {list.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelected(r)}
                      className={`w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/50 ${selected?.id === r.id ? "bg-muted border-primary/50 font-medium" : ""}`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 && <p className="text-sm text-muted-foreground">No reports are available to your role.</p>}
          </div>

          <div className="space-y-4 min-w-0">
            {!selected && (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">Choose a report on the left.</CardContent>
              </Card>
            )}

            {selected && (
              <>
                <div>
                  <h2 className="text-xl font-semibold">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                </div>

                <div className="flex flex-wrap items-end gap-3 print:hidden">
                  {uses("dates") && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">{selected.id === "ar_ageing" ? "From (not used)" : "From"}</Label>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{selected.id === "ar_ageing" ? "As at" : "To"}</Label>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                      </div>
                    </>
                  )}
                  {uses("entity") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Entity</Label>
                      <Select value={entity} onValueChange={setEntity}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All entities</SelectItem>
                          {options.entities.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.short_code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {uses("partner") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Partner</Label>
                      <Select value={partner} onValueChange={setPartner}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All partners</SelectItem>
                          {options.partners.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {uses("group") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Client group</Label>
                      <Select value={group} onValueChange={setGroup}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All groups</SelectItem>
                          {options.groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {uses("by") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Show by</Label>
                      <Select value={by} onValueChange={setBy}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="service_line">Service line</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button onClick={run} disabled={running}>
                    <Play className="size-4 mr-2" /> {running ? "Running…" : "Run"}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={`/api/reports/export?${query}`}>
                      <FileSpreadsheet className="size-4 mr-2" /> Excel
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => window.print()} disabled={!result}>
                    <Printer className="size-4 mr-2" /> Print / PDF
                  </Button>
                </div>

                {running && !result && <Skeleton className="h-48 w-full" />}

                {result && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
                      {uses("dates") ? ` · ${cell(from, "date")} to ${cell(to, "date")}` : ""}
                    </p>
                    <DataTable t={result} />
                    {(result.extra ?? []).map((t, i) => (
                      <DataTable key={i} t={t} />
                    ))}
                    {(result.notes ?? []).length > 0 && (
                      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                        <p className="text-xs font-medium">How to read this</p>
                        {result.notes!.map((n, i) => (
                          <p key={i} className="text-xs text-muted-foreground">{n}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
