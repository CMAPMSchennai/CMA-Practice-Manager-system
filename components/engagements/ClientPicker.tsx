"use client";

/**
 * Client picker for the Create Engagement form.
 * Opens a window that lists every client the user may see, with a search box
 * (name, trade name, client code, GSTIN), a status filter and a partner filter.
 * Click a row to choose it. Only the clients the access rules allow are listed.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PickerClient {
  id: string;
  name: string;
  client_code?: string | null;
  trade_name?: string | null;
  gstin?: string | null;
  onboarding_status?: string | null;
  partner_name?: string | null;
  entity_type_label?: string | null;
  is_active?: boolean | null;
}

interface ClientPickerProps {
  clients: PickerClient[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}

const PAGE = 50;

function statusLabel(s?: string | null): string {
  if (!s) return "";
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function ClientPicker({ clients, value, onChange, loading }: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [partner, setPartner] = useState("all");
  const [entity, setEntity] = useState("all");
  const [shown, setShown] = useState(PAGE);

  const selected = clients.find((c) => c.id === value) ?? null;

  const statuses = useMemo(
    () => Array.from(new Set(clients.map((c) => c.onboarding_status).filter(Boolean))) as string[],
    [clients],
  );
  const partners = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.partner_name).filter(Boolean)) as Set<string>).sort(),
    [clients],
  );

  const entities = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.entity_type_label).filter(Boolean)) as Set<string>).sort(),
    [clients],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (status !== "all" && c.onboarding_status !== status) return false;
      if (entity === "none" && c.entity_type_label) return false;
      if (entity !== "all" && entity !== "none" && c.entity_type_label !== entity) return false;
      if (partner === "none" && c.partner_name) return false;
      if (partner !== "all" && partner !== "none" && c.partner_name !== partner) return false;
      if (!needle) return true;
      return [c.name, c.trade_name, c.client_code, c.gstin].some((f) =>
        (f ?? "").toLowerCase().includes(needle),
      );
    });
  }, [clients, q, status, partner, entity]);

  const reset = () => {
    setQ("");
    setStatus("all");
    setPartner("all");
    setEntity("all");
    setShown(PAGE);
  };

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const filterActive = status !== "all" || partner !== "all" || entity !== "all" || q.trim() !== "";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected
            ? `${selected.name}${selected.client_code ? `  ·  ${selected.client_code}` : ""}`
            : loading
              ? "Loading clients…"
              : "Choose a client"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="p-4 pb-3 border-b border-border">
            <DialogTitle>Choose a client</DialogTitle>
            <DialogDescription>
              {clients.length} client{clients.length === 1 ? "" : "s"} you can see. Search, filter, then click one.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 pb-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search by name, trade name, client code or GSTIN"
                className="pl-9"
                aria-label="Search clients"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor="cp-entity">Type</label>
              <select
                id="cp-entity"
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  setShown(PAGE);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground max-w-[12rem]"
              >
                <option value="all">All types</option>
                <option value="none">Type not set</option>
                {entities.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <label className="text-xs text-muted-foreground ml-2" htmlFor="cp-status">Stage</label>
              <select
                id="cp-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setShown(PAGE);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All stages</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>

              <label className="text-xs text-muted-foreground ml-2" htmlFor="cp-partner">Partner</label>
              <select
                id="cp-partner"
                value={partner}
                onChange={(e) => {
                  setPartner(e.target.value);
                  setShown(PAGE);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground max-w-[12rem]"
              >
                <option value="all">All partners</option>
                <option value="none">No partner set</option>
                {partners.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {filterActive && (
                <Button type="button" variant="ghost" size="sm" className="h-8 ml-auto" onClick={reset}>
                  <X className="size-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground" aria-live="polite">
              Showing {Math.min(shown, filtered.length)} of {filtered.length}
              {filtered.length !== clients.length ? ` (${clients.length} in total)` : ""}
            </p>
          </div>

          <div className="max-h-[22rem] overflow-y-auto border-t border-border" role="listbox" aria-label="Clients">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {clients.length === 0
                  ? "No clients to show. A Manager sees only clients on engagements they have been added to."
                  : "No client matches. Try a shorter word, or clear the filters."}
              </div>
            ) : (
              filtered.slice(0, shown).map((c) => {
                const isSel = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => choose(c.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border bg-card text-foreground hover:bg-muted focus:bg-muted focus:outline-none",
                      isSel && "bg-muted",
                    )}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{c.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {[c.client_code, c.entity_type_label, c.trade_name, c.partner_name ? `Partner: ${c.partner_name}` : null]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </span>
                    </span>
                    {c.onboarding_status && (
                      <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground">
                        {statusLabel(c.onboarding_status)}
                      </span>
                    )}
                    {isSel && <Check className="size-4 shrink-0 text-foreground" aria-label="Chosen" />}
                  </button>
                );
              })
            )}
            {filtered.length > shown && (
              <div className="p-3 text-center">
                <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, filtered.length - shown)} more
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
