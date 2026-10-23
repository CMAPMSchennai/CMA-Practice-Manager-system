"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Package, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagerFeeSwitch } from "@/components/settings/VisibilityCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ServiceType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_service_id: string | null;
  parent_name: string | null;
  is_attest: boolean;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  standard_fee: number | null;
  sac_code: string | null;
  is_active: boolean;
  /** Set by the firm: a checklist job, a simple job, or null (whoever creates the job chooses). */
  job_type?: "checklist" | "simple" | null;
}

type Draft = { fee: string; sac: string; active: boolean; job: "checklist" | "simple" | "ask" };

const JOB_TYPE_LABEL: Record<string, string> = { checklist: "Checklist job", simple: "Simple job" };

export default function ServiceTypesPage() {
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "attest" | "non_attest">("all");
  const [filterParent, setFilterParent] = useState<"all" | "root" | "oem">("all");
  const [selected, setSelected] = useState<ServiceType | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Edits are held here until Save: service id -> typed fee, SAC code and whether it is in use.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteInfo, setPasteInfo] = useState<{ matched: number; unmatched: string[] } | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/service-types")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.service_types) ? data.service_types :
                     Array.isArray(data) ? data : [];
        setServices(list);
        setCanEdit(!!data?.can_edit);
      })
      .catch(() => toast.error("Failed to load service types"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const draftOf = (s: ServiceType): Draft =>
    drafts[s.id] ?? {
      fee: s.standard_fee == null ? "" : String(s.standard_fee),
      sac: s.sac_code ?? "",
      active: s.is_active,
      job: s.job_type ?? "ask",
    };

  function setDraft(s: ServiceType, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [s.id]: { ...draftOf(s), ...patch } }));
  }

  // Paste two columns copied from Excel: the service name, then the rate. Names are matched to the
  // catalogue; nothing is saved until the person checks the prices and presses Save.
  function applyPaste() {
    const byName = new Map<string, ServiceType>();
    for (const s of services) {
      const k = s.name.trim().toLowerCase();
      if (!byName.has(k) || (!byName.get(k)!.is_active && s.is_active)) byName.set(k, s);
    }
    let matched = 0;
    const unmatched: string[] = [];
    const next = { ...drafts };
    for (const line of pasteText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cols = line.includes("\t") ? line.split("\t") : line.split(/,(?=[^,]*$)/);
      const name = (cols[0] ?? "").trim();
      const rate = Number(String(cols[cols.length - 1] ?? "").replace(/[₹,\s]/g, ""));
      if (!name || cols.length < 2 || !Number.isFinite(rate) || rate < 0) continue;
      const svc = byName.get(name.toLowerCase());
      if (!svc) {
        unmatched.push(name);
        continue;
      }
      next[svc.id] = { ...(next[svc.id] ?? draftOf(svc)), fee: String(rate) };
      matched++;
    }
    setDrafts(next);
    setPasteInfo({ matched, unmatched });
  }

  async function savePrices() {
    const updates = services
      .filter((s) => drafts[s.id])
      .map((s) => {
        const d = drafts[s.id];
        return { id: s.id, standard_fee: d.fee.trim() === "" ? null : Number(d.fee), sac_code: d.sac.trim() === "" ? null : d.sac.trim(), is_active: d.active, job_type: d.job };
      });
    if (updates.length === 0) {
      toast.message("Nothing has changed.");
      return;
    }
    if (updates.some((u) => u.standard_fee !== null && !Number.isFinite(u.standard_fee))) {
      toast.error("A fee is not a number. Check the prices and try again.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/service-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The prices couldn't be saved.");
        return;
      }
      toast.success(`Saved. ${json.changed} service${json.changed === 1 ? "" : "s"} changed.`);
      setDrafts({});
      setPasteText("");
      setPasteInfo(null);
      setEditMode(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const rootServices = useMemo(() =>
    services.filter((s) => !s.parent_service_id),
    [services]
  );

  const filtered = useMemo(() => {
    let list = services;
    if (filterType === "attest") list = list.filter((s) => s.is_attest);
    if (filterType === "non_attest") list = list.filter((s) => !s.is_attest);
    if (filterParent === "root") list = list.filter((s) => !s.parent_service_id);
    if (filterParent === "oem") list = list.filter((s) => !!s.parent_service_id);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [services, search, filterType, filterParent]);

  const oemChildren = useMemo(() => {
    const map: Record<string, ServiceType[]> = {};
    for (const s of services) {
      if (s.parent_service_id) {
        if (!map[s.parent_service_id]) map[s.parent_service_id] = [];
        map[s.parent_service_id].push(s);
      }
    }
    return map;
  }, [services]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Service Type Catalogue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {services.length} services ({rootServices.length} base + {services.length - rootServices.length} OEM sub-items)
          </p>
        </div>
        <div className="sm:ml-auto flex flex-wrap items-center gap-3">
          {canEdit && !editMode && (
            <Button size="sm" onClick={() => setEditMode(true)}>
              <Pencil className="size-4 mr-2" /> Edit prices
            </Button>
          )}
          <ManagerFeeSwitch />
        </div>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Services", value: services.length },
            { label: "Attest Services", value: services.filter((s) => s.is_attest).length },
            { label: "Recurring", value: services.filter((s) => s.is_recurring).length },
            { label: "OEM Sub-items", value: services.filter((s) => !!s.parent_service_id).length },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="attest">Attest Services</SelectItem>
            <SelectItem value="non_attest">Non-Attest</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterParent} onValueChange={(v) => setFilterParent(v as typeof filterParent)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="root">Base Services</SelectItem>
            <SelectItem value="oem">OEM Sub-items</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Master price list: edit mode (Managing Partner and Admin) */}
      {editMode && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Edit prices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Fees are in rupees <strong className="text-foreground">before GST</strong>. A new engagement starts with
                the standard fee and can be changed for a client&apos;s special rate. Changing a price here does not change
                engagements that already exist.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="paste-rates" className="text-xs font-medium text-foreground">
                  Paste from Excel (optional): two columns, the service name and its rate
                </label>
                <textarea
                  id="paste-rates"
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"15 CA/CB\t3500\nNetworth Certificate\t3500"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground font-mono"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="outline" onClick={applyPaste} disabled={!pasteText.trim()}>
                    Fill in the prices
                  </Button>
                  {pasteInfo && (
                    <span className="text-xs text-muted-foreground">
                      {pasteInfo.matched} matched
                      {pasteInfo.unmatched.length > 0 && `, ${pasteInfo.unmatched.length} not found: ${pasteInfo.unmatched.slice(0, 6).join(", ")}${pasteInfo.unmatched.length > 6 ? "…" : ""}`}
                      . Nothing is saved until you press Save.
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Service</th>
                      <th className="px-4 py-2 font-medium w-40">Standard fee (₹)</th>
                      <th className="px-4 py-2 font-medium w-32">SAC code</th>
                      <th className="px-4 py-2 font-medium w-40">Job type</th>
                      <th className="px-4 py-2 font-medium w-24">In use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((s) => {
                      const d = draftOf(s);
                      const touched = !!drafts[s.id];
                      return (
                        <tr key={s.id} className={touched ? "bg-muted/40" : ""}>
                          <td className="px-4 py-1.5 text-foreground">
                            {s.parent_service_id ? <span className="text-muted-foreground">└ </span> : null}
                            {s.name}
                            <code className="ml-2 text-xs text-muted-foreground font-mono">{s.code}</code>
                          </td>
                          <td className="px-4 py-1.5">
                            <input
                              aria-label={`Standard fee for ${s.name}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={d.fee}
                              onChange={(e) => setDraft(s, { fee: e.target.value })}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground tabular-nums"
                            />
                          </td>
                          <td className="px-4 py-1.5">
                            <input
                              aria-label={`SAC code for ${s.name}`}
                              value={d.sac}
                              maxLength={20}
                              onChange={(e) => setDraft(s, { sac: e.target.value })}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                            />
                          </td>
                          <td className="px-4 py-1.5">
                            <select
                              aria-label={`Job type for ${s.name}`}
                              value={d.job}
                              onChange={(e) => setDraft(s, { job: e.target.value as Draft["job"] })}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                            >
                              <option value="ask">Ask each time</option>
                              <option value="checklist">Checklist job</option>
                              <option value="simple">Simple job</option>
                            </select>
                          </td>
                          <td className="px-4 py-1.5">
                            <input
                              aria-label={`${s.name} in use`}
                              type="checkbox"
                              checked={d.active}
                              onChange={(e) => setDraft(s, { active: e.target.checked })}
                              className="size-4 accent-[hsl(var(--primary))]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground mr-auto">
              {Object.keys(drafts).length} service{Object.keys(drafts).length === 1 ? "" : "s"} changed
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setDrafts({});
                setPasteText("");
                setPasteInfo(null);
                setEditMode(false);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={savePrices} disabled={saving || Object.keys(drafts).length === 0}>
              {saving ? "Saving…" : "Save prices"}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {editMode ? null : loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "No services match your search." : "No service types found."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((svc) => {
            const childCount = oemChildren[svc.id]?.length ?? 0;
            return (
              <div
                key={svc.id}
                className={`rounded-md border border-border bg-card p-4 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all ${
                  svc.parent_service_id ? "ml-6 border-dashed" : ""
                }`}
                onClick={() => setSelected(svc)}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {svc.parent_service_id && (
                        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium text-foreground">{svc.name}</span>
                      <code className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground font-mono">
                        {svc.code}
                      </code>
                      {svc.is_attest && (
                        <Badge variant="secondary" className="text-xs">Attest</Badge>
                      )}
                      {svc.is_recurring && (
                        <Badge variant="outline" className="text-xs">Recurring</Badge>
                      )}
                      {svc.job_type && (
                        <Badge variant="outline" className="text-xs">{JOB_TYPE_LABEL[svc.job_type]}</Badge>
                      )}
                      {!svc.is_active && (
                        <Badge variant="destructive" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    {svc.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{svc.description}</p>
                    )}
                    {svc.parent_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        OEM sub-item of: <span className="font-medium">{svc.parent_name}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    {childCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {childCount} sub-items
                      </span>
                    )}
                    {svc.standard_fee != null && (
                      <span className="text-sm font-medium text-foreground">
                        ₹{svc.standard_fee.toLocaleString("en-IN")}
                      </span>
                    )}
                    {svc.sac_code && (
                      <span className="text-xs text-muted-foreground">SAC: {svc.sac_code}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" />
              {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <code className="text-xs bg-muted rounded px-2 py-1 text-muted-foreground font-mono">
                  {selected.code}
                </code>
                {selected.is_attest && <Badge variant="secondary">Attest</Badge>}
                {selected.is_recurring && <Badge variant="outline">Recurring</Badge>}
                {!selected.is_active && <Badge variant="destructive">Inactive</Badge>}
              </div>
              {selected.description && (
                <p className="text-sm text-foreground">{selected.description}</p>
              )}
              <dl className="divide-y divide-border">
                {selected.parent_name && (
                  <div className="grid grid-cols-2 gap-2 py-2">
                    <dt className="text-sm text-muted-foreground">Parent Service</dt>
                    <dd className="text-sm font-medium">{selected.parent_name}</dd>
                  </div>
                )}
                {selected.recurrence_pattern && (
                  <div className="grid grid-cols-2 gap-2 py-2">
                    <dt className="text-sm text-muted-foreground">Recurrence</dt>
                    <dd className="text-sm font-medium capitalize">{selected.recurrence_pattern}</dd>
                  </div>
                )}
                {selected.standard_fee != null && (
                  <div className="grid grid-cols-2 gap-2 py-2">
                    <dt className="text-sm text-muted-foreground">Standard Fee</dt>
                    <dd className="text-sm font-medium">₹{selected.standard_fee.toLocaleString("en-IN")}</dd>
                  </div>
                )}
                {selected.sac_code && (
                  <div className="grid grid-cols-2 gap-2 py-2">
                    <dt className="text-sm text-muted-foreground">SAC Code</dt>
                    <dd className="text-sm font-medium font-mono">{selected.sac_code}</dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 py-2">
                  <dt className="text-sm text-muted-foreground">Attest Service</dt>
                  <dd className="text-sm font-medium">{selected.is_attest ? "Yes" : "No"}</dd>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2">
                  <dt className="text-sm text-muted-foreground">Recurring</dt>
                  <dd className="text-sm font-medium">{selected.is_recurring ? "Yes" : "No"}</dd>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2">
                  <dt className="text-sm text-muted-foreground">Job type</dt>
                  <dd className="text-sm font-medium">{selected.job_type ? JOB_TYPE_LABEL[selected.job_type] : "Ask each time"}</dd>
                </div>
              </dl>
              {oemChildren[selected.id]?.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    OEM Sub-items ({oemChildren[selected.id].length})
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {oemChildren[selected.id].map((child) => (
                      <div key={child.id} className="flex items-center gap-2 rounded px-2 py-1.5 bg-muted/50">
                        <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">{child.name}</span>
                        <code className="text-xs text-muted-foreground ml-auto font-mono">{child.code}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
