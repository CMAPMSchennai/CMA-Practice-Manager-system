"use client";

/**
 * Settings → Data Migration — FR-83 workbook importer (MP and Admin, Gap #36).
 * 1. Choose the firm's workbook and check it (dry run — nothing saved).
 * 2. Review: new records, changes to existing records (approve each, Gap #41),
 *    duplicates held for review (§11.3), errors, warnings, records missing
 *    from the file (report only, Gap #42).
 * 3. Import. Each import is a batch that can be rolled back.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, RotateCcw, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Change {
  label: string;
  before: string | null;
  after: string | null;
}
interface Item {
  key: string;
  kind: "employee" | "client";
  sheet: string;
  row: number;
  name: string;
  action: "create" | "update" | "unchanged" | "review" | "error";
  existing_id: string | null;
  errors: string[];
  warnings: string[];
  changes: Change[];
}
interface Plan {
  summary: {
    employees: { create: number; update: number; unchanged: number; error: number };
    clients: { create: number; update: number; unchanged: number; review: number; error: number; profile_incomplete: number };
    missing: number;
  };
  employees: Item[];
  clients: Item[];
  missing: { kind: "employee" | "client"; id: string; name: string; code: string | null }[];
  unmatched_services: { value: string; count: number }[];
  unmatched_entity_types: { value: string; count: number }[];
  sheet_errors: string[];
  new_columns: string[];
}
interface Batch {
  id: string;
  status: "in_progress" | "applied" | "rolled_back";
  file_name: string;
  imported_by: string;
  imported_at: string;
  counts: Record<string, number>;
  error_count: number;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  rollback_kept: { name: string; reason: string }[];
}
interface ImportResult {
  batch_id: string;
  counts: Record<string, number>;
  errors: { name: string; row: number; sheet: string; error: string }[];
}

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  const color =
    tone === "bad" && value ? "text-destructive" : tone === "warn" && value ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ItemList({
  items,
  selectable,
  selected,
  onToggle,
  empty,
}: {
  items: Item[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (key: string, on: boolean) => void;
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground py-4">{empty}</p>;
  return (
    <div className="divide-y rounded-md border">
      {items.map((i) => (
        <div key={i.key} className="flex gap-3 p-3">
          {selectable && (
            <Checkbox
              id={`sel-${i.key}`}
              checked={selected?.has(i.key) ?? false}
              onCheckedChange={(v) => onToggle?.(i.key, v === true)}
              className="mt-0.5"
              aria-label={`Include ${i.name}`}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`sel-${i.key}`} className="text-sm font-medium text-foreground">
                {i.name}
              </label>
              <span className="text-xs text-muted-foreground">
                {i.sheet} · row {i.row}
              </span>
            </div>
            {i.errors.map((e) => (
              <p key={e} className="text-xs text-destructive">{e}</p>
            ))}
            {i.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-700">{w}</p>
            ))}
            {i.changes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="mt-1 text-xs">
                  <tbody>
                    {i.changes.map((c) => (
                      <tr key={c.label}>
                        <td className="pr-3 py-0.5 text-muted-foreground whitespace-nowrap">{c.label}</td>
                        <td className="pr-2 py-0.5 text-muted-foreground line-through">{c.before ?? "empty"}</td>
                        <td className="py-0.5 text-foreground">{c.after ?? "empty"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DataMigrationPage() {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [encryptionActive, setEncryptionActive] = useState(true);
  const [approvedUpdates, setApprovedUpdates] = useState<Set<string>>(new Set());
  const [approvedDuplicates, setApprovedDuplicates] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const loadBatches = useCallback(() => {
    fetch("/api/migration/batches")
      .then((r) => r.json())
      .then((d: { batches?: Batch[] }) => {
        if (d.batches) setBatches(d.batches);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  async function check() {
    if (!file) return;
    setChecking(true);
    setPlan(null);
    setResult(null);
    setConfirming(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "dry-run");
      const res = await fetch("/api/migration/workbook", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "The file couldn't be checked");
        return;
      }
      const p = data.plan as Plan;
      setPlan(p);
      setEncryptionActive(data.encryption_active !== false);
      // Changes start approved (untick to skip); duplicates start held back (§11.3).
      setApprovedUpdates(new Set([...p.employees, ...p.clients].filter((i) => i.action === "update").map((i) => i.key)));
      setApprovedDuplicates(new Set());
    } catch {
      toast.error("The file couldn't be checked");
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    if (!file || !plan) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "apply");
      fd.append("approvals", JSON.stringify({ updates: [...approvedUpdates], duplicates: [...approvedDuplicates] }));
      const res = await fetch("/api/migration/workbook", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "The import couldn't be completed");
        return;
      }
      setResult(data as ImportResult);
      setPlan(null);
      setConfirming(false);
      toast.success("Import finished");
      loadBatches();
    } catch {
      toast.error("The import couldn't be completed");
    } finally {
      setImporting(false);
    }
  }

  async function rollback(id: string) {
    setRollingBack(true);
    try {
      const res = await fetch(`/api/migration/batches/${id}/rollback`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "The rollback couldn't be completed");
        return;
      }
      toast.success(
        data.kept?.length ? `Rolled back. ${data.kept.length} record(s) kept because they're in use.` : "Rolled back",
      );
      setRollbackId(null);
      loadBatches();
    } catch {
      toast.error("The rollback couldn't be completed");
    } finally {
      setRollingBack(false);
    }
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    setter(next);
  };

  const all = plan ? [...plan.employees, ...plan.clients] : [];
  const updates = all.filter((i) => i.action === "update");
  const reviews = all.filter((i) => i.action === "review");
  const errors = all.filter((i) => i.action === "error");
  const created = all.filter((i) => i.action === "create");
  const withWarnings = all.filter((i) => i.action !== "error" && i.warnings.length > 0);
  const blocked = !!plan && (plan.sheet_errors.length > 0 || !encryptionActive);
  const unmatchedCount = plan
    ? plan.unmatched_services.length + plan.unmatched_entity_types.length + plan.new_columns.length
    : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data Migration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import clients and employees from the firm&apos;s workbook. Check the file first. Nothing is saved until you
          import, and every import can be rolled back.
        </p>
      </div>

      {/* Step 1 — choose and check */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Workbook
          </CardTitle>
          <CardDescription>
            Reads Employee Master, Client Master. and the hidden Client Master sheet. Entities, services and task
            libraries are already in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="workbook-file">Excel workbook (.xlsx)</Label>
            <Input
              id="workbook-file"
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPlan(null);
                setResult(null);
              }}
            />
          </div>
          <Button onClick={check} disabled={!file || checking}>
            <Upload className="size-4 mr-2" />
            {checking ? "Checking…" : "Check file"}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2 — report */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Check results</CardTitle>
            <CardDescription>Nothing has been saved yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {plan.sheet_errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
                {plan.sheet_errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            {!encryptionActive && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
                Encryption isn&apos;t active, so this file can be checked but not imported.
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Employees</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="New" value={plan.summary.employees.create} />
                <Stat label="Changes to review" value={plan.summary.employees.update} tone="warn" />
                <Stat label="Unchanged" value={plan.summary.employees.unchanged} />
                <Stat label="Can't import" value={plan.summary.employees.error} tone="bad" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Clients</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Stat label="New" value={plan.summary.clients.create} />
                <Stat label="New, profile incomplete" value={plan.summary.clients.profile_incomplete} />
                <Stat label="Changes to review" value={plan.summary.clients.update} tone="warn" />
                <Stat label="Duplicates to review" value={plan.summary.clients.review} tone="warn" />
                <Stat label="Can't import" value={plan.summary.clients.error} tone="bad" />
              </div>
            </div>

            <Tabs defaultValue={updates.length ? "changes" : reviews.length ? "duplicates" : "new"}>
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="new">New ({created.length})</TabsTrigger>
                <TabsTrigger value="changes">Changes ({updates.length})</TabsTrigger>
                <TabsTrigger value="duplicates">Duplicates ({reviews.length})</TabsTrigger>
                <TabsTrigger value="errors">Can&apos;t import ({errors.length})</TabsTrigger>
                <TabsTrigger value="warnings">Warnings ({withWarnings.length})</TabsTrigger>
                <TabsTrigger value="unmatched">Not matched ({unmatchedCount})</TabsTrigger>
                <TabsTrigger value="missing">Missing from file ({plan.missing.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="mt-3">
                <ItemList items={created} empty="No new records." />
              </TabsContent>

              <TabsContent value="changes" className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  These records already exist. Ticked ones are updated with the workbook values. Empty cells in the
                  workbook never clear existing values.
                </p>
                <ItemList
                  items={updates}
                  selectable
                  selected={approvedUpdates}
                  onToggle={toggle(approvedUpdates, setApprovedUpdates)}
                  empty="No changes to existing records."
                />
              </TabsContent>

              <TabsContent value="duplicates" className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  These names already appear earlier in the file, so they are held back. Tick one only if it is a
                  separate client.
                </p>
                <ItemList
                  items={reviews}
                  selectable
                  selected={approvedDuplicates}
                  onToggle={toggle(approvedDuplicates, setApprovedDuplicates)}
                  empty="No duplicate names."
                />
              </TabsContent>

              <TabsContent value="errors" className="mt-3">
                <ItemList items={errors} empty="Every row can be imported." />
              </TabsContent>

              <TabsContent value="warnings" className="mt-3">
                <ItemList items={withWarnings} empty="No warnings." />
              </TabsContent>

              <TabsContent value="unmatched" className="mt-3 space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Services not matched</p>
                  <p className="text-xs text-muted-foreground mb-2">Kept as notes on the client, not linked as services.</p>
                  {plan.unmatched_services.length ? (
                    <ul className="text-sm space-y-1">
                      {plan.unmatched_services.map((s) => (
                        <li key={s.value}>
                          {s.value} <span className="text-muted-foreground">× {s.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">All services matched.</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Entity types not matched</p>
                  <p className="text-xs text-muted-foreground mb-2">These clients are imported without an entity type.</p>
                  {plan.unmatched_entity_types.length ? (
                    <ul className="text-sm space-y-1">
                      {plan.unmatched_entity_types.map((s) => (
                        <li key={s.value}>
                          {s.value} <span className="text-muted-foreground">× {s.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">All entity types matched.</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">New columns</p>
                  <p className="text-xs text-muted-foreground mb-2">Kept as extra details on each record.</p>
                  {plan.new_columns.length ? (
                    <ul className="text-sm space-y-1">
                      {plan.new_columns.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No new columns.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="missing" className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  In the app but not in this file. Nothing is deleted; update or deactivate them yourself if needed.
                </p>
                {plan.missing.length ? (
                  <div className="divide-y rounded-md border">
                    {plan.missing.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <span className="text-foreground">{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.kind === "employee" ? "Employee" : "Client"} · {m.code}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing missing.</p>
                )}
              </TabsContent>
            </Tabs>

            {/* Step 3 — confirm and import */}
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              {!confirming ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-foreground">
                    Ready to import: {created.length} new, {approvedUpdates.size} change(s) approved,{" "}
                    {approvedDuplicates.size} duplicate(s) approved. {errors.length} row(s) will be skipped.
                  </p>
                  <Button onClick={() => setConfirming(true)} disabled={blocked || importing}>
                    Import
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    Import now? This saves {created.length + approvedDuplicates.size} new record(s) and updates{" "}
                    {approvedUpdates.size}. You can roll it back afterwards from Import history.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={runImport} disabled={importing}>
                      {importing ? "Importing…" : "Confirm import"}
                    </Button>
                    <Button variant="outline" onClick={() => setConfirming(false)} disabled={importing}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4 text-accent" />
              Import finished
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Stat label="Employees added" value={result.counts.employees_created ?? 0} />
              <Stat label="Employees updated" value={result.counts.employees_updated ?? 0} />
              <Stat label="Clients added" value={result.counts.clients_created ?? 0} />
              <Stat label="Clients updated" value={result.counts.clients_updated ?? 0} />
              <Stat label="Service links" value={result.counts.services_linked ?? 0} />
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="size-4" />
                  {result.errors.length} row(s) failed
                </p>
                {result.errors.map((e) => (
                  <p key={`${e.sheet}-${e.row}`} className="text-xs text-muted-foreground">
                    {e.sheet} row {e.row} — {e.name}: {e.error}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {batches.map((b) => (
                <div key={b.id} className="p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground break-all">{b.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {when(b.imported_at)} by {b.imported_by} · {b.counts.employees_created ?? 0} employees and{" "}
                        {b.counts.clients_created ?? 0} clients added,{" "}
                        {(b.counts.employees_updated ?? 0) + (b.counts.clients_updated ?? 0)} updated
                        {b.error_count ? ` · ${b.error_count} failed` : ""}
                      </p>
                      {b.status === "rolled_back" && (
                        <p className="text-xs text-muted-foreground">
                          Rolled back {when(b.rolled_back_at)} by {b.rolled_back_by}
                          {b.rollback_kept.length ? ` · ${b.rollback_kept.length} kept (in use)` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={b.status === "applied" ? "default" : "outline"}>
                        {b.status === "applied" ? "Imported" : b.status === "rolled_back" ? "Rolled back" : "Incomplete"}
                      </Badge>
                      {b.status !== "rolled_back" && rollbackId !== b.id && (
                        <Button variant="outline" size="sm" onClick={() => setRollbackId(b.id)}>
                          <RotateCcw className="size-4 mr-1" />
                          Roll back
                        </Button>
                      )}
                    </div>
                  </div>
                  {rollbackId === b.id && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <p className="text-sm text-foreground">
                        Roll back this import? Records it added are removed and values it changed are restored.
                        Records already in use (a login, engagements) are kept.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => rollback(b.id)} disabled={rollingBack}>
                          {rollingBack ? "Rolling back…" : "Confirm roll back"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRollbackId(null)} disabled={rollingBack}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {b.rollback_kept.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc pl-5">
                      {b.rollback_kept.map((k) => (
                        <li key={`${b.id}-${k.name}`}>
                          {k.name}: {k.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
