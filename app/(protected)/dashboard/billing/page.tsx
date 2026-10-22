"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Receipt, FileText, Clock, AlertTriangle, DollarSign } from "lucide-react";
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
import { InvoicesTable, type InvoiceRow } from "@/components/billing/InvoicesTable";
import { InvoicePreviewDialog } from "@/components/billing/InvoicePreviewDialog";
import { ReceiptRecordingDialog } from "@/components/billing/ReceiptRecordingDialog";
import { RemindersPanel } from "@/components/billing/RemindersPanel";
import { ExportButton } from "@/components/reports/ExportButton";
import { Bell } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Entity {
  id: string;
  name: string;
  short_code: string;
}

interface ReceiptRow extends Record<string, unknown> {
  id: string;
  invoice_number: string;
  client_name: string;
  receipt_date: string;
  amount: number;
  tds_amount: number | null;
  payment_mode: string | null;
  payment_reference: string | null;
}

interface UnbilledRow {
  engagement_id: string;
  engagement_code: string;
  client_name: string | null;
  service: string | null;
  progress_pct: number;
  agreed_fee: number;
  unbilled: number;
}

interface Summary {
  wip: { amount: number; engagements: number };
  billed_month: { amount: number; count: number };
  collected: { amount: number; realisation_pct: number | null };
  overdue_60: { amount: number; clients: number };
  unbilled_rows: UnbilledRow[];
  error?: string;
}

type RegisterFilter = "all" | "draft" | "raised" | "paid" | "overdue";
const FILTERS: { value: RegisterFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "raised", label: "Raised" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];
const FILTER_STATUSES: Record<RegisterFilter, string[] | null> = {
  all: null,
  draft: ["draft"],
  raised: ["issued", "sent", "partially_paid"],
  paid: ["paid"],
  overdue: ["overdue"],
};

export default function BillingPage() {
  const router = useRouter();
  const [selectedEntity, setSelectedEntity] = useState("all");
  const [filter, setFilter] = useState<RegisterFilter>("all");
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [receiptDialog, setReceiptDialog] = useState<{
    open: boolean;
    invoiceId: string;
    clientId: string;
    billingEntityId: string;
    outstanding: number;
  }>({ open: false, invoiceId: "", clientId: "", billingEntityId: "", outstanding: 0 });

  // Load entities
  const { data: entData } = useSWR<{ entities: Entity[] }>("/api/entities", fetcher);
  const entities = Array.isArray(entData?.entities) ? entData.entities : [];

  // Load invoices
  const invoiceUrl = selectedEntity === "all" ? "/api/invoices" : `/api/invoices?billing_entity_id=${selectedEntity}`;
  const { data: invData, isLoading: invLoading, mutate: mutateInvoices } = useSWR<{ invoices: InvoiceRow[] }>(
    invoiceUrl,
    fetcher,
  );
  const allInvoices = Array.isArray(invData?.invoices) ? invData.invoices : [];
  const statuses = FILTER_STATUSES[filter];
  const invoices = statuses ? allInvoices.filter((i) => statuses.includes(i.status)) : allInvoices;

  // Load the four headline figures and the unbilled rows
  const summaryUrl =
    selectedEntity === "all" ? "/api/invoices/summary" : `/api/invoices/summary?billing_entity_id=${selectedEntity}`;
  const { data: summaryData, mutate: mutateSummary } = useSWR<Summary>(summaryUrl, fetcher);
  const summary = summaryData && !summaryData.error ? summaryData : null;
  const unbilledRows = summary?.unbilled_rows ?? [];

  // Load receipts
  const { data: rcpData, isLoading: rcpLoading, mutate: mutateReceipts } = useSWR<{ receipts: ReceiptRow[] }>(
    "/api/receipts",
    fetcher,
  );
  const receipts = Array.isArray(rcpData?.receipts) ? rcpData.receipts : [];

  // Load AR ageing
  const ageingUrl = selectedEntity === "all" ? "/api/invoices/ar-ageing" : `/api/invoices/ar-ageing?billing_entity_id=${selectedEntity}`;
  const { data: ageingData, mutate: mutateAgeing } = useSWR(ageingUrl, fetcher);

  const refreshAll = useCallback(() => {
    mutateInvoices();
    mutateReceipts();
    mutateAgeing();
    mutateSummary();
  }, [mutateInvoices, mutateReceipts, mutateAgeing, mutateSummary]);

  const ageingBuckets = ageingData && !ageingData.error
    ? ageingData
    : { "0_30": 0, "31_60": 0, "61_90": 0, over_90: 0, total_outstanding: 0, invoice_count: 0 };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Invoices, receipts, and accounts receivable</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.short_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton
            report="invoice_register"
            label="Excel"
            params={{ entity_id: selectedEntity !== "all" ? selectedEntity : undefined }}
          />
          <Button onClick={() => router.push("/dashboard/billing/invoices/new")}>
            <Plus className="size-4 mr-1" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Work in progress (unbilled)</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{summary ? fmt(summary.wip.amount) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {summary ? `across ${summary.wip.engagements} engagements` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Billed this month</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{summary ? fmt(summary.billed_month.amount) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.billed_month.count} invoices` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Collected this month</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{summary ? fmt(summary.collected.amount) : "—"}</p>
            <p className="text-xs text-muted-foreground">
              {summary
                ? summary.collected.realisation_pct == null
                  ? "Realisation: nothing billed yet"
                  : `Realisation ${summary.collected.realisation_pct}%`
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-destructive font-medium">Overdue more than 60 days</p>
            <p className="text-xl font-semibold tabular-nums mt-1 text-destructive">
              {summary ? fmt(summary.overdue_60.amount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.overdue_60.clients} clients` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AR Ageing Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="size-3" />
              0–30 Days
            </div>
            <p className="text-xl font-semibold tabular-nums mt-1">{fmt(Number(ageingBuckets["0_30"]))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="size-3" />
              31–60 Days
            </div>
            <p className="text-xl font-semibold tabular-nums mt-1">{fmt(Number(ageingBuckets["31_60"]))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <AlertTriangle className="size-3" />
              61–90 Days
            </div>
            <p className="text-xl font-semibold tabular-nums mt-1">{fmt(Number(ageingBuckets["61_90"]))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
              <AlertTriangle className="size-3" />
              90+ Days
            </div>
            <p className="text-xl font-semibold tabular-nums mt-1 text-destructive">{fmt(Number(ageingBuckets.over_90))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <DollarSign className="size-3" />
              Total Outstanding
            </div>
            <p className="text-xl font-semibold tabular-nums mt-1">{fmt(Number(ageingBuckets.total_outstanding))}</p>
            <p className="text-xs text-muted-foreground">{Number(ageingBuckets.invoice_count)} invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Invoices / Receipts */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="size-3.5" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="unbilled" className="gap-1.5">
            <Clock className="size-3.5" />
            Unbilled ({unbilledRows.length})
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-1.5">
            <Receipt className="size-3.5" />
            Receipts
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5">
            <Bell className="size-3.5" />
            Reminders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unbilled" className="mt-4">
          {unbilledRows.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nothing unbilled. Work in progress appears here once an engagement with an agreed fee has completed tasks
                that haven't been invoiced yet.
              </p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Engagement</th>
                    <th className="text-left px-4 py-2 font-medium">Client</th>
                    <th className="text-left px-4 py-2 font-medium">Service</th>
                    <th className="text-right px-4 py-2 font-medium">Progress</th>
                    <th className="text-right px-4 py-2 font-medium">Agreed fee</th>
                    <th className="text-right px-4 py-2 font-medium">Unbilled</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unbilledRows.map((r) => (
                    <tr
                      key={r.engagement_id}
                      className="border-t cursor-pointer hover:bg-muted/30"
                      onClick={() => router.push(`/dashboard/engagements/${r.engagement_id}`)}
                    >
                      <td className="px-4 py-2 font-medium">{r.engagement_code}</td>
                      <td className="px-4 py-2">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.service ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.progress_pct}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(Number(r.agreed_fee))}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(Number(r.unbilled))}</td>
                      <td className="px-4 py-2 text-muted-foreground">Unbilled</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reminders" className="mt-4">
          <RemindersPanel />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <InvoicesTable
            data={invoices as InvoiceRow[]}
            loading={invLoading}
            onView={(row) => router.push(`/dashboard/billing/invoices/${row.id}`)}
          />
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          {rcpLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No receipts recorded yet.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Invoice</th>
                    <th className="text-left px-4 py-2 font-medium">Client</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-right px-4 py-2 font-medium">TDS</th>
                    <th className="text-left px-4 py-2 font-medium">Mode</th>
                    <th className="text-left px-4 py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">
                        {r.receipt_date
                          ? new Date(String(r.receipt_date)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 font-medium">{r.invoice_number || "—"}</td>
                      <td className="px-4 py-2">{r.client_name || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {fmt(Number(r.amount))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {Number(r.tds_amount) > 0 ? fmt(Number(r.tds_amount)) : "—"}
                      </td>
                      <td className="px-4 py-2 capitalize">{r.payment_mode ? String(r.payment_mode).replace(/_/g, " ") : "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.payment_reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invoice Preview Dialog */}
      <InvoicePreviewDialog
        open={!!previewInvoice}
        onOpenChange={(v) => { if (!v) setPreviewInvoice(null); }}
        invoice={previewInvoice as never}
      />

      {/* Receipt Recording Dialog */}
      <ReceiptRecordingDialog
        open={receiptDialog.open}
        onOpenChange={(v) => setReceiptDialog((prev) => ({ ...prev, open: v }))}
        invoiceId={receiptDialog.invoiceId}
        clientId={receiptDialog.clientId}
        billingEntityId={receiptDialog.billingEntityId}
        outstanding={receiptDialog.outstanding}
        onSuccess={refreshAll}
      />
    </div>
  );
}
