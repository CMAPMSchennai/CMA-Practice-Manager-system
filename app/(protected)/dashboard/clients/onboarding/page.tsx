"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Client {
  id: string;
  client_code: string;
  name: string;
  trade_name: string | null;
  contact_email: string | null;
  onboarding_status: string;
  partner_in_charge_id: string | null;
  partner_name: string | null;
  created_at: string;
  updated_at: string;
}

const STAGES = [
  { key: "imported", label: "Imported", description: "Client record created, awaiting KYC submission." },
  { key: "kyc_and_docs", label: "KYC & Docs", description: "Form submitted; documents under review." },
  { key: "conflict_check", label: "Conflict Check", description: "Conflict of interest assessment in progress." },
  { key: "engagement_letter", label: "Engagement Letter", description: "Letter drafted; awaiting partner sign-off." },
  { key: "activated", label: "Activated", description: "Client fully onboarded and active." },
];

const FIRST_SHOWN = 8;
const MORE_STEP = 16;

/** Days since the record last changed. It is the nearest thing to "time in this stage". */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function ageTone(days: number): StatusTone {
  if (days <= 7) return "ok";
  if (days <= 14) return "warn";
  if (days <= 29) return "urgent";
  return "over";
}

function ageText(days: number): string {
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  return `Updated ${days} days ago`;
}

export default function ClientOnboardingPipelinePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const myId = session?.user?.id;

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [partner, setPartner] = useState("all");
  const [shown, setShown] = useState<Record<string, number>>({});
  const [showActivated, setShowActivated] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load every page, so counts are complete however many clients there are.
      const all: Client[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await fetch(`/api/clients?page_size=500&page=${page}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to load clients");
          return;
        }
        if (Array.isArray(data?.clients)) all.push(...data.clients);
        totalPages = Number(data?.pagination?.total_pages ?? 1);
        page++;
      } while (page <= totalPages);
      setClients(all);
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function moveClient(clientId: string, from: string, to: string, withUndo: boolean) {
    setMoving(clientId);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_status: to }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to move the client");
        return;
      }
      const label = STAGES.find((s) => s.key === to)?.label ?? to;
      if (withUndo) {
        toast.success(`Moved to ${label}`, {
          action: { label: "Undo", onClick: () => moveClient(clientId, to, from, false) },
        });
      } else {
        toast.success(`Moved back to ${label}`);
      }
      loadData();
    } catch {
      toast.error("Failed to move the client");
    } finally {
      setMoving(null);
    }
  }

  const partners = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) {
      if (c.partner_in_charge_id) m.set(c.partner_in_charge_id, c.partner_name ?? "Partner");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [clients]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (partner === "mine" && c.partner_in_charge_id !== myId) return false;
      if (partner !== "all" && partner !== "mine" && c.partner_in_charge_id !== partner) return false;
      if (!needle) return true;
      return `${c.name} ${c.trade_name ?? ""} ${c.client_code}`.toLowerCase().includes(needle);
    });
  }, [clients, q, partner, myId]);

  const byStage = useMemo(() => {
    const g: Record<string, Client[]> = {};
    for (const s of STAGES) {
      const list = filtered.filter((c) => c.onboarding_status === s.key);
      // Longest-waiting first, so the clients that need a nudge are at the top.
      list.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      g[s.key] = list;
    }
    return g;
  }, [filtered]);

  const inProgress = STAGES.filter((s) => s.key !== "activated").reduce((n, s) => n + (byStage[s.key]?.length ?? 0), 0);
  const activatedCount = byStage["activated"]?.length ?? 0;
  const filtering = q.trim() !== "" || partner !== "all";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/clients")} className="p-0 h-auto">
              <ArrowLeft className="size-4 mr-1" />
              Directory
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client Onboarding Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${inProgress} client${inProgress !== 1 ? "s" : ""} still being onboarded, ${activatedCount} activated${filtering ? " (filtered)" : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Search and partner filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a client name or code"
            aria-label="Search clients"
            className="pl-9"
          />
        </div>
        <Select value={partner} onValueChange={setPartner}>
          <SelectTrigger className="sm:w-60" aria-label="Partner in charge">
            <SelectValue placeholder="All partners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partners</SelectItem>
            {myId && <SelectItem value="mine">My clients only</SelectItem>}
            {partners.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setPartner("all"); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Pipeline stages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {STAGES.map((stage, stageIndex) => {
          const list = byStage[stage.key] ?? [];
          const isLast = stage.key === "activated";
          const collapsed = isLast && !showActivated;
          const limit = shown[stage.key] ?? FIRST_SHOWN;
          const visible = list.slice(0, limit);
          return (
            <div key={stage.key} className="flex flex-col min-w-0">
              {/* Stage header */}
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{stage.label}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {loading ? "—" : list.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
              </div>

              <div className="space-y-2 flex-1">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <Card key={i} className="border border-border">
                      <CardContent className="p-3">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </CardContent>
                    </Card>
                  ))
                ) : collapsed ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">{list.length} activated</p>
                    <p className="text-xs text-muted-foreground">These clients are finished with onboarding.</p>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => setShowActivated(true)} disabled={list.length === 0}>
                        Show them here
                      </Button>
                      <Link href="/dashboard/clients" className="text-xs text-primary underline">
                        Open the Directory
                      </Link>
                    </div>
                  </div>
                ) : list.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted-foreground">{filtering ? "No match" : "No clients"}</p>
                  </div>
                ) : (
                  <>
                    {visible.map((client) => {
                      const days = daysSince(client.updated_at);
                      const prev = stageIndex > 0 ? STAGES[stageIndex - 1].key : null;
                      const next = !isLast ? STAGES[stageIndex + 1].key : null;
                      return (
                        <Card key={client.id} className="border border-border hover:shadow-sm transition-shadow">
                          <CardContent className="p-3">
                            <div className="cursor-pointer" onClick={() => router.push(`/dashboard/clients/${client.id}`)}>
                              <p className="text-sm font-medium text-foreground leading-tight">{client.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {client.client_code}
                                {client.partner_name ? ` · ${client.partner_name}` : ""}
                              </p>
                              {!isLast && (
                                <span className="mt-1.5 inline-flex">
                                  <StatusChip tone={ageTone(days)}>{ageText(days)}</StatusChip>
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-1">
                              {prev ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-muted-foreground"
                                  disabled={moving === client.id}
                                  onClick={() => moveClient(client.id, stage.key, prev, false)}
                                  aria-label={`Move ${client.name} back one stage`}
                                >
                                  <ArrowLeft className="size-3 mr-1" /> Back
                                </Button>
                              ) : (
                                <span />
                              )}
                              {next && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-primary hover:text-primary"
                                  disabled={moving === client.id}
                                  onClick={() => moveClient(client.id, stage.key, next, true)}
                                  aria-label={`Advance ${client.name} to the next stage`}
                                >
                                  {moving === client.id ? "Moving…" : (
                                    <>
                                      Advance <ArrowRight className="size-3 ml-1" />
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {list.length > limit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setShown((s) => ({ ...s, [stage.key]: limit + MORE_STEP }))}
                      >
                        Show {Math.min(MORE_STEP, list.length - limit)} more ({list.length - limit} left)
                      </Button>
                    )}
                    {limit > FIRST_SHOWN && list.length <= limit && list.length > FIRST_SHOWN && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setShown((s) => ({ ...s, [stage.key]: FIRST_SHOWN }))}
                      >
                        Show fewer
                      </Button>
                    )}
                    {isLast && showActivated && (
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowActivated(false)}>
                        Hide activated clients
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
