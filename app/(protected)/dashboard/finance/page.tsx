"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import {
  Download,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Building2,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpensesTable, type ExpenseRow } from "@/components/finance/ExpensesTable";
import { ExpenseEntryDialog } from "@/components/finance/ExpenseEntryDialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function generatePeriods(count: number): string[] {
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return periods;
}

type Mode = "month" | "quarter" | "fy" | "custom";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
/** yyyy-mm-dd from local date parts (no timezone shift). */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Indian financial year: April to March. Returns the year it starts in. */
function currentFyStart() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}
function currentQuarter() {
  const m = new Date().getMonth(); // 0 = Jan
  if (m >= 3 && m <= 5) return 1;
  if (m >= 6 && m <= 8) return 2;
  if (m >= 9) return 3;
  return 4;
}
const QUARTER_TEXT = ["Apr – Jun", "Jul – Sep", "Oct – Dec", "Jan – Mar"];

/** The date range (both ends included) that the chosen period stands for. */
function rangeFor(
  mode: Mode,
  month: string,
  fy: number,
  quarter: number,
  customFrom: string,
  customTo: string,
): { from: string; to: string; label: string } | null {
  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    return { from: `${month}-01`, to: isoDate(new Date(y, m, 0)), label: month };
  }
  if (mode === "fy") {
    return { from: `${fy}-04-01`, to: `${fy + 1}-03-31`, label: `FY ${fy}-${String(fy + 1).slice(2)}` };
  }
  if (mode === "quarter") {
    const startMonth = [3, 6, 9, 0][quarter - 1];
    const year = quarter === 4 ? fy + 1 : fy;
    return {
      from: isoDate(new Date(year, startMonth, 1)),
      to: isoDate(new Date(year, startMonth + 3, 0)),
      label: `FY ${fy}-${String(fy + 1).slice(2)} Q${quarter} (${QUARTER_TEXT[quarter - 1]})`,
    };
  }
  if (!customFrom || !customTo || customTo < customFrom) return null;
  return { from: customFrom, to: customTo, label: `${customFrom} to ${customTo}` };
}

interface DetailData {
  invoices: { invoice_number: string; invoice_date: string; client_name: string | null; total_amount: number; status: string }[];
  receipts: { receipt_date: string; invoice_number: string; client_name: string | null; amount: number; tds_amount: number; payment_mode: string | null }[];
  expenses: { expense_date: string; category: string | null; description: string | null; amount: number; gst_amount: number }[];
}

interface Entity {
  id: string;
  name: string;
  short_code: string;
}

interface PLData {
  entity_id: string;
  entity_name: string;
  period: string;
  revenue: number;
  invoiced_revenue: number;
  expenses: number;
  expense_gst: number;
  tds_deducted: number;
  net_profit: number;
}

export default function FinancePage() {
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [mode, setMode] = useState<Mode>("month");
  const [fy, setFy] = useState(currentFyStart());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(
    () => rangeFor(mode, selectedPeriod, fy, quarter, customFrom, customTo),
    [mode, selectedPeriod, fy, quarter, customFrom, customTo],
  );
  const fyChoices = Array.from({ length: 5 }, (_, i) => currentFyStart() - i);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [plByEntity, setPlByEntity] = useState<PLData[]>([]);
  const [plLoading, setPlLoading] = useState(false);

  const periods = generatePeriods(12);

  // Load entities
  const { data: entData } = useSWR<{ entities: Entity[] }>("/api/entities", fetcher);
  const entities = Array.isArray(entData?.entities) ? entData.entities : [];

  // Load expenses
  const expenseUrl =
    selectedEntity === "all"
      ? "/api/expenses"
      : `/api/expenses?entity_id=${selectedEntity}`;
  const {
    data: expData,
    isLoading: expLoading,
    mutate: mutateExpenses,
  } = useSWR<{ expenses: ExpenseRow[] }>(expenseUrl, fetcher);
  const expenses = Array.isArray(expData?.expenses) ? expData.expenses : [];

  // Load P&L for each entity for selected period
  const loadPL = useCallback(async () => {
    if (entities.length === 0) return;
    if (!range) {
      setPlByEntity([]);
      return;
    }
    setPlLoading(true);
    try {
      const targetEntities =
        selectedEntity === "all" ? entities : entities.filter((e) => e.id === selectedEntity);

      const results = await Promise.all(
        targetEntities.map(async (ent) => {
          try {
            const res = await fetch(
              `/api/finance/pl?entity_id=${ent.id}&from=${range.from}&to=${range.to}`
            );
            if (!res.ok) return null;
            return (await res.json()) as PLData;
          } catch {
            return null;
          }
        })
      );
      setPlByEntity(results.filter((r): r is PLData => r !== null));
    } finally {
      setPlLoading(false);
    }
  }, [entities, selectedEntity, range]);

  useEffect(() => {
    if (entities.length > 0) {
      loadPL();
    }
  }, [entities.length, selectedEntity, range, loadPL]);

  // The entries behind one entity's figures (shown when a single entity is chosen).
  const { data: detail } = useSWR<DetailData>(
    selectedEntity !== "all" && range
      ? `/api/finance/entity-detail?entity_id=${selectedEntity}&from=${range.from}&to=${range.to}`
      : null,
    fetcher,
  );

  function downloadCsv() {
    if (!range || plByEntity.length === 0) return;
    const head = ["Entity", "Period", "Revenue (collections)", "Invoiced", "Expenses", "TDS deducted", "Net profit"];
    const rows = plByEntity.map((p) => [p.entity_name, range.label, p.revenue, p.invoiced_revenue, p.expenses, p.tds_deducted, p.net_profit]);
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entity-wise-profit-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Consolidated totals
  const totalRevenue = plByEntity.reduce((s, p) => s + p.revenue, 0);
  const totalInvoiced = plByEntity.reduce((s, p) => s + p.invoiced_revenue, 0);
  const totalExpenses = plByEntity.reduce((s, p) => s + p.expenses, 0);
  const totalNetProfit = plByEntity.reduce((s, p) => s + p.net_profit, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Expenses, per-entity P&L, and cash-flow overview
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger className="w-36" aria-label="Period type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">By month</SelectItem>
              <SelectItem value="quarter">By quarter</SelectItem>
              <SelectItem value="fy">Financial year</SelectItem>
              <SelectItem value="custom">Custom dates</SelectItem>
            </SelectContent>
          </Select>
          {mode === "month" && (
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-36" aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {new Date(p + "-01").toLocaleDateString("en-IN", {
                      month: "short",
                      year: "numeric",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(mode === "fy" || mode === "quarter") && (
            <Select value={String(fy)} onValueChange={(v) => setFy(Number(v))}>
              <SelectTrigger className="w-36" aria-label="Financial year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fyChoices.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    FY {y}-{String(y + 1).slice(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "quarter" && (
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger className="w-40" aria-label="Quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUARTER_TEXT.map((t, i) => (
                  <SelectItem key={t} value={String(i + 1)}>
                    Q{i + 1} ({t})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-40" aria-label="From date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" className="w-40" aria-label="To date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities (Consolidated)</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.short_code} — {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setExpenseDialogOpen(true)}>
            <Plus className="size-4 mr-1" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* P&L Summary Cards */}
      {plLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <DollarSign className="size-3" />
                Revenue (Collections)
              </div>
              <p className="text-xl font-semibold tabular-nums mt-1">{fmt(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Receipt className="size-3" />
                Invoiced Revenue
              </div>
              <p className="text-xl font-semibold tabular-nums mt-1">{fmt(totalInvoiced)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <TrendingDown className="size-3" />
                Total Expenses
              </div>
              <p className="text-xl font-semibold tabular-nums mt-1">{fmt(totalExpenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <TrendingUp className="size-3" />
                Net Profit
              </div>
              <p
                className={`text-xl font-semibold tabular-nums mt-1 ${
                  totalNetProfit >= 0 ? "" : "text-destructive"
                }`}
              >
                {fmt(totalNetProfit)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Entity P&L Breakdown */}
      {plByEntity.length > 1 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-lg">Entity-wise income and profit — {range?.label}</CardTitle>
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              <Download className="size-4 mr-1" />
              Download CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Entity</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">Invoiced</th>
                    <th className="text-right px-4 py-2 font-medium">Expenses</th>
                    <th className="text-right px-4 py-2 font-medium">TDS</th>
                    <th className="text-right px-4 py-2 font-medium">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {plByEntity.map((pl) => (
                    <tr key={pl.entity_id} className="border-t">
                      <td className="px-4 py-2 font-medium">{pl.entity_name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(pl.revenue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(pl.invoiced_revenue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(pl.expenses)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(pl.tds_deducted)}</td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-medium ${
                          pl.net_profit >= 0 ? "" : "text-destructive"
                        }`}
                      >
                        {fmt(pl.net_profit)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-2">Consolidated</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totalInvoiced)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(totalExpenses)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmt(plByEntity.reduce((s, p) => s + p.tds_deducted, 0))}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        totalNetProfit >= 0 ? "" : "text-destructive"
                      }`}
                    >
                      {fmt(totalNetProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single-entity detail when one entity selected */}
      {plByEntity.length === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="size-5" />
              {plByEntity[0].entity_name} — {range?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue (Collections)</span>
              <span className="tabular-nums font-medium">{fmt(plByEntity[0].revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoiced Revenue</span>
              <span className="tabular-nums">{fmt(plByEntity[0].invoiced_revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expenses</span>
              <span className="tabular-nums">{fmt(plByEntity[0].expenses)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expense GST</span>
              <span className="tabular-nums">{fmt(plByEntity[0].expense_gst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">TDS Deducted</span>
              <span className="tabular-nums">{fmt(plByEntity[0].tds_deducted)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Net Profit</span>
              <span
                className={`tabular-nums ${
                  plByEntity[0].net_profit >= 0 ? "" : "text-destructive"
                }`}
              >
                {fmt(plByEntity[0].net_profit)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "custom" && !range && (
        <p className="text-sm text-muted-foreground">Choose a start date and an end date (the end on or after the start).</p>
      )}
      {selectedEntity === "all" && range && (
        <p className="text-sm text-muted-foreground">
          Choose one entity above to see the invoices, receipts and expenses behind its figures.
        </p>
      )}

      {/* The entries behind one entity's figures */}
      {selectedEntity !== "all" && detail && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">Invoices raised ({detail.invoices.length})</h2>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Invoice</th>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Client</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-3 text-muted-foreground">No invoices in this period.</td></tr>
                  )}
                  {detail.invoices.map((r) => (
                    <tr key={r.invoice_number} className="border-t">
                      <td className="px-4 py-2 font-mono">{r.invoice_number}</td>
                      <td className="px-4 py-2">{r.invoice_date}</td>
                      <td className="px-4 py-2">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2">{r.status}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Money received ({detail.receipts.length})</h2>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Invoice</th>
                    <th className="text-left px-4 py-2 font-medium">Client</th>
                    <th className="text-left px-4 py-2 font-medium">Mode</th>
                    <th className="text-right px-4 py-2 font-medium">TDS</th>
                    <th className="text-right px-4 py-2 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.receipts.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-3 text-muted-foreground">No receipts in this period.</td></tr>
                  )}
                  {detail.receipts.map((r, i) => (
                    <tr key={`${r.invoice_number}-${r.receipt_date}-${i}`} className="border-t">
                      <td className="px-4 py-2">{r.receipt_date}</td>
                      <td className="px-4 py-2 font-mono">{r.invoice_number}</td>
                      <td className="px-4 py-2">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2">{r.payment_mode ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.tds_amount)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Expenses booked to this entity ({detail.expenses.length})</h2>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Category</th>
                    <th className="text-left px-4 py-2 font-medium">Description</th>
                    <th className="text-right px-4 py-2 font-medium">GST</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.expenses.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-3 text-muted-foreground">No expenses in this period.</td></tr>
                  )}
                  {detail.expenses.map((r, i) => (
                    <tr key={`${r.expense_date}-${i}`} className="border-t">
                      <td className="px-4 py-2">{r.expense_date}</td>
                      <td className="px-4 py-2">{r.category ?? "—"}</td>
                      <td className="px-4 py-2">{r.description ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.gst_amount)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Expenses</h2>
        </div>
        <ExpensesTable data={expenses as ExpenseRow[]} loading={expLoading} />
      </div>

      {/* Expense Entry Dialog */}
      <ExpenseEntryDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        onSuccess={() => {
          mutateExpenses();
          loadPL();
        }}
      />
    </div>
  );
}
