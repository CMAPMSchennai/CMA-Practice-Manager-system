"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Search, Plus, RefreshCw, Filter, Link2, Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClientForm } from "@/components/clients/ClientForm";
import { OnboardingStatusCell } from "@/components/clients/cells/OnboardingStatusCell";
import { ExportButton } from "@/components/reports/ExportButton";

interface DirectoryClient {
  id: string;
  client_code: string;
  name: string;
  trade_name: string | null;
  entity_type_label: string | null;
  pan_last4: string | null;
  area: string | null;
  services: string[];
  partner_name: string | null;
  onboarding_status: string;
  kyc_verified: boolean;
}

interface Summary {
  total: number;
  companies: number;
  individuals: number;
  trust_llp: number;
  other: number;
  onboarding_pending: number;
  kyc_verified: number;
  activated: number;
}

interface Choices {
  partners: { id: string; name: string }[];
  services: { id: string; name: string; code: string }[];
  entities: { id: string; name: string; short_code: string }[];
}

type BulkMode = "assign_partner" | "set_scope" | "mark_kyc" | "start_onboarding" | null;

const PAGE_SIZE = 50;

export default function ClientDirectoryPage() {
  const router = useRouter();
  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenGenerating, setTokenGenerating] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<BulkMode>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [serviceIds, setServiceIds] = useState<Set<string>>(new Set());
  const [serviceFilter, setServiceFilter] = useState("");
  const [createEngagements, setCreateEngagements] = useState(false);
  const [fallbackEntity, setFallbackEntity] = useState("");
  const [working, setWorking] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);

  // Wait a moment after typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, status: statusFilter });
      if (q) params.set("q", q);
      const res = await fetch(`/api/clients/directory?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load clients");
        return;
      }
      setClients(Array.isArray(data.clients) ? data.clients : []);
      setSummary(data.summary ?? null);
      setCanEdit(!!data.can_edit);
      setCanCreate(!!data.can_create);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, q]);

  const pageCount = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const pageRows = useMemo(() => clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [clients, page]);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((c) => selected.has(c.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((c) => next.delete(c.id));
      else pageRows.forEach((c) => next.add(c.id));
      return next;
    });
  }

  async function openBulk(mode: Exclude<BulkMode, null>) {
    setSkipped([]);
    setBulkMode(mode);
    if ((mode === "assign_partner" || mode === "set_scope") && !choices) {
      const res = await fetch("/api/clients/bulk");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setChoices(data);
      else toast.error(data.error ?? "Could not load the choices");
    }
  }

  async function runBulk() {
    if (!bulkMode) return;
    setWorking(true);
    try {
      const payload: Record<string, unknown> = { ids: Array.from(selected), action: bulkMode };
      if (bulkMode === "assign_partner") payload.partner_id = partnerId;
      if (bulkMode === "set_scope") {
        payload.service_type_ids = Array.from(serviceIds);
        payload.create_engagements = createEngagements;
        if (createEngagements && fallbackEntity) payload.billing_entity_id = fallbackEntity;
      }
      const res = await fetch("/api/clients/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "That didn't work. Please try again.");
        return;
      }
      toast.success(data.message ?? "Done.");
      if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        setSkipped(data.skipped);
      } else {
        setBulkMode(null);
      }
      setSelected(new Set());
      setServiceIds(new Set());
      setCreateEngagements(false);
      load();
    } finally {
      setWorking(false);
    }
  }

  async function generateOnboardingLink(clientId: string) {
    setTokenGenerating(clientId);
    try {
      const res = await fetch("/api/onboarding-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to generate link");
        return;
      }
      const link = `${window.location.origin}/onboarding/${json.token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Onboarding link copied to clipboard! Expires in 7 days.");
    } catch {
      toast.error("Failed to generate link");
    } finally {
      setTokenGenerating(null);
    }
  }

  const visibleServices = (choices?.services ?? []).filter((s) =>
    s.name.toLowerCase().includes(serviceFilter.toLowerCase()),
  );

  const bulkTitle: Record<Exclude<BulkMode, null>, string> = {
    assign_partner: "Assign partner in charge",
    set_scope: "Set scope of services",
    mark_kyc: "Mark KYC verified",
    start_onboarding: "Start onboarding",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Users className="size-6 text-primary" />
            Client Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage clients, track onboarding status, and generate KYC links.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="size-4 mr-2" /> Refresh
          </Button>
          <ExportButton report="client_master" />
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/clients/onboarding")}>
            <Link2 className="size-4 mr-2" /> Pipeline
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-2" /> Add Client
            </Button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            {loading && !summary ? <Skeleton className="h-7 w-12 mb-1" /> : <p className="text-2xl font-semibold">{summary?.total ?? 0}</p>}
            <p className="text-xs text-muted-foreground">Total clients</p>
            {summary && (
              <p className="text-xs text-muted-foreground mt-1">
                Companies {summary.companies} · Individuals {summary.individuals} · Trust/LLP {summary.trust_llp}
                {summary.other > 0 ? ` · Other ${summary.other}` : ""}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading && !summary ? <Skeleton className="h-7 w-12 mb-1" /> : <p className="text-2xl font-semibold">{summary?.onboarding_pending ?? 0}</p>}
            <p className="text-xs text-muted-foreground">Onboarding pending</p>
            <p className="text-xs text-muted-foreground mt-1">Not yet activated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading && !summary ? (
              <Skeleton className="h-7 w-16 mb-1" />
            ) : (
              <p className="text-2xl font-semibold">
                {summary?.kyc_verified ?? 0}
                <span className="text-base font-normal text-muted-foreground"> / {summary?.total ?? 0}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">KYC verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading && !summary ? <Skeleton className="h-7 w-12 mb-1" /> : <p className="text-2xl font-semibold">{summary?.activated ?? 0}</p>}
            <p className="text-xs text-muted-foreground">Activated</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList className="flex w-max min-w-full sm:w-auto">
            <TabsTrigger value="all">All{summary ? ` (${summary.total})` : ""}</TabsTrigger>
            <TabsTrigger value="companies">Companies{summary ? ` (${summary.companies})` : ""}</TabsTrigger>
            <TabsTrigger value="individuals">Individuals{summary ? ` (${summary.individuals})` : ""}</TabsTrigger>
            <TabsTrigger value="trust_llp">Trust / LLP{summary ? ` (${summary.trust_llp})` : ""}</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Search + stage */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search name, PAN, GSTIN, client code or city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="size-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="imported">Imported</SelectItem>
            <SelectItem value="kyc_and_docs">KYC &amp; Docs</SelectItem>
            <SelectItem value="conflict_check">Conflict Check</SelectItem>
            <SelectItem value="engagement_letter">Engagement Letter</SelectItem>
            <SelectItem value="activated">Activated</SelectItem>
          </SelectContent>
        </Select>
        {canEdit && (
          <Button variant="outline" asChild>
            <Link href="/dashboard/clients/groups">
              <Users className="size-4 mr-2" /> Client groups
            </Link>
          </Button>
        )}
      </div>

      {/* Bulk bar */}
      {canEdit && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {clients.length > selected.size && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setSelected(new Set(clients.map((c) => c.id)))}
            >
              Select all {clients.length} shown
            </Button>
          )}
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" variant="outline" onClick={() => openBulk("assign_partner")}>Assign partner in charge</Button>
            <Button size="sm" variant="outline" onClick={() => openBulk("set_scope")}>Set services</Button>
            <Button size="sm" variant="outline" onClick={() => openBulk("mark_kyc")}>Mark KYC verified</Button>
            <Button size="sm" variant="outline" onClick={() => openBulk("start_onboarding")}>Start onboarding</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="bg-muted/50 text-left">
              {canEdit && (
                <th className="px-3 py-2 w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={togglePage} aria-label="Select this page" />
                </th>
              )}
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">PAN</th>
              <th className="px-3 py-2 font-medium">City / area</th>
              <th className="px-3 py-2 font-medium">Services</th>
              <th className="px-3 py-2 font-medium">Partner in charge</th>
              <th className="px-3 py-2 font-medium">Onboarding</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && clients.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td colSpan={canEdit ? 9 : 8} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="px-3 py-10 text-center text-muted-foreground">
                  No clients match. Check the search and filters. A Manager or staff member sees only the clients on engagements they have been added to; a Partner can add you.
                </td>
              </tr>
            )}
            {pageRows.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                {canEdit && (
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Select ${c.name}`} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <button type="button" className="text-left" onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                    <p className="font-medium text-foreground hover:underline">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.client_code}
                      {c.trade_name ? ` · ${c.trade_name}` : ""}
                    </p>
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.entity_type_label ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {c.pan_last4 ? `••••••${c.pan_last4}` : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.area ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1 max-w-[260px]">
                    {c.services.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs font-normal">{s}</Badge>
                    ))}
                    {c.services.length > 3 && (
                      <Badge variant="outline" className="text-xs font-normal">+{c.services.length - 3}</Badge>
                    )}
                    {c.services.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.partner_name ?? "—"}</td>
                <td className="px-3 py-2">
                  <OnboardingStatusCell value={c.onboarding_status} />
                  {c.kyc_verified && <p className="text-xs text-muted-foreground mt-0.5">KYC verified</p>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={tokenGenerating === c.id}
                      onClick={() => generateOnboardingLink(c.id)}
                      title="Copy a KYC link for the client"
                    >
                      <Copy className="size-4 mr-1" /> KYC link
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {clients.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, clients.length)} of {clients.length}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create client dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <ClientForm
            onSuccess={() => {
              setCreateOpen(false);
              load();
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Bulk action dialog */}
      <Dialog open={bulkMode !== null} onOpenChange={(v) => { if (!v) { setBulkMode(null); setSkipped([]); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bulkMode ? bulkTitle[bulkMode] : ""}</DialogTitle>
            <DialogDescription>
              {bulkMode === "mark_kyc" && `Ticks "KYC/ID proof of signatories" on the checklist of ${selected.size} clients.`}
              {bulkMode === "start_onboarding" && `Moves the Imported clients among the ${selected.size} selected into the KYC & Docs stage. Clients already past Imported are left alone.`}
              {bulkMode === "assign_partner" && `Sets the partner in charge for ${selected.size} clients.`}
              {bulkMode === "set_scope" && `Adds services to the scope of ${selected.size} clients. Existing services are kept.`}
            </DialogDescription>
          </DialogHeader>

          {bulkMode === "assign_partner" && (
            <div className="space-y-2">
              <Label>Partner in charge</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue placeholder={choices ? "Choose a partner" : "Loading…"} /></SelectTrigger>
                <SelectContent>
                  {(choices?.partners ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {bulkMode === "set_scope" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Services ({serviceIds.size} chosen)</Label>
                <Input placeholder="Find a service…" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} />
                <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
                  {!choices && <p className="text-sm text-muted-foreground p-2">Loading…</p>}
                  {visibleServices.map((s) => (
                    <label key={s.id} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={serviceIds.has(s.id)}
                        onCheckedChange={() =>
                          setServiceIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={createEngagements} onCheckedChange={(v) => setCreateEngagements(v === true)} />
                <span>
                  Also create a draft engagement for the current period for each client and service
                  <span className="block text-xs text-muted-foreground">
                    Services that don't repeat get an engagement with no period. Nothing is created twice.
                  </span>
                </span>
              </label>
              {createEngagements && (
                <div className="space-y-2">
                  <Label>Billing entity for services that have no default</Label>
                  <Select value={fallbackEntity} onValueChange={setFallbackEntity}>
                    <SelectTrigger><SelectValue placeholder="Choose an entity (optional)" /></SelectTrigger>
                    <SelectContent>
                      {(choices?.entities ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.short_code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Most services have no default billing entity yet. Without one, those are skipped and listed afterwards.
                  </p>
                </div>
              )}
            </div>
          )}

          {skipped.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-1 max-h-48 overflow-y-auto">
              <p className="font-medium text-amber-800">{skipped.length} skipped</p>
              {skipped.slice(0, 60).map((s, i) => (
                <p key={i} className="text-xs text-amber-700">{s}</p>
              ))}
              {skipped.length > 60 && <p className="text-xs text-amber-700">…and {skipped.length - 60} more.</p>}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setBulkMode(null); setSkipped([]); }}>
              {skipped.length > 0 ? "Close" : "Cancel"}
            </Button>
            {skipped.length === 0 && (
              <Button
                disabled={
                  working ||
                  (bulkMode === "assign_partner" && !partnerId) ||
                  (bulkMode === "set_scope" && serviceIds.size === 0)
                }
                onClick={runBulk}
              >
                {working ? "Working…" : "Apply to selected clients"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
