"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const STANDARD = [0, 5, 12, 18, 28];

function cleanRate(text: string): number | null {
  const n = Number(text.trim());
  if (!text.trim() || !Number.isFinite(n) || n < 0 || n > 100) return null;
  const r = Math.round(n * 100) / 100;
  return Math.abs(r - n) < 1e-9 ? r : null;
}

export default function GstRatesPage() {
  const [rates, setRates] = useState<number[]>([]);
  const [defaultRate, setDefaultRate] = useState(18);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newRate, setNewRate] = useState("");

  useEffect(() => {
    fetch("/api/settings/gst-rates")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.rates)) {
          setRates(d.rates);
          setDefaultRate(d.default_rate);
          setCanEdit(!!d.can_edit);
        } else {
          toast.error(d?.error ?? "The GST rates couldn't be loaded.");
        }
      })
      .catch(() => toast.error("The GST rates couldn't be loaded."))
      .finally(() => setLoading(false));
  }, []);

  function addRate() {
    const r = cleanRate(newRate);
    if (r === null) {
      toast.error("Enter a rate from 0 to 100, with at most two decimals.");
      return;
    }
    if (rates.includes(r)) {
      toast.error(`${r}% is already in the list.`);
      return;
    }
    setRates([...rates, r].sort((a, b) => a - b));
    setNewRate("");
    setDirty(true);
  }

  function removeRate(r: number) {
    if (rates.length <= 1) {
      toast.error("Keep at least one rate in the list.");
      return;
    }
    const next = rates.filter((x) => x !== r);
    setRates(next);
    if (r === defaultRate) setDefaultRate(next.includes(18) ? 18 : next[0]);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/gst-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates, default_rate: defaultRate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The GST rates couldn't be saved.");
        return;
      }
      setRates(json.rates);
      setDefaultRate(json.default_rate);
      setDirty(false);
      toast.success("GST rates saved. New invoices use this list.");
    } catch {
      toast.error("The GST rates couldn't be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">GST rates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The rates a fee line on an invoice can use. Change the list when the law changes. Invoices already raised keep the
          rate they were raised with.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Allowed rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <>
              <ul className="flex flex-wrap gap-2" aria-label="Allowed GST rates">
                {rates.map((r) => (
                  <li key={r} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                    <span className="tabular-nums font-medium">{r}%</span>
                    {r === defaultRate && <span className="text-xs text-muted-foreground">default</span>}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${r}%`}
                        className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => removeRate(r)}
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {canEdit ? (
                <>
                  <div className="flex items-end gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-rate">Add a rate (%)</Label>
                      <Input
                        id="new-rate"
                        inputMode="decimal"
                        className="w-32"
                        value={newRate}
                        placeholder="e.g. 3"
                        onChange={(e) => setNewRate(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addRate();
                          }
                        }}
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={addRate}>
                      <Plus className="size-4 mr-1" /> Add
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="default-rate">Rate a new fee line starts with</Label>
                    <select
                      id="default-rate"
                      className="h-9 w-32 rounded-md border bg-background px-2 text-sm"
                      value={defaultRate}
                      onChange={(e) => {
                        setDefaultRate(Number(e.target.value));
                        setDirty(true);
                      }}
                    >
                      {rates.map((r) => (
                        <option key={r} value={r}>
                          {r}%
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button onClick={save} disabled={!dirty || saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setRates(STANDARD);
                        setDefaultRate(18);
                        setDirty(true);
                      }}
                    >
                      Back to the standard list (0, 5, 12, 18, 28)
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Only the Managing Partner or Admin can change this list.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        GST is worked out line by line, at the rate chosen on each fee line. The tax type (IGST, or CGST and SGST) is chosen
        on the invoice itself.
      </p>
    </div>
  );
}
