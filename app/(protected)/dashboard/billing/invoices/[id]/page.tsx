"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, Receipt, FileText, Send, CheckCircle2, Ban, FileX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptRecordingDialog } from "@/components/billing/ReceiptRecordingDialog";
import { InvoicePreviewDialog } from "@/components/billing/InvoicePreviewDialog";
import { InvoiceStatusCell } from "@/components/billing/cells/InvoiceStatusCell";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InvoiceDetail extends Record<string, unknown> {
  id: string;
  invoice_number: string;
  billing_entity_id: string;
  billing_entity_name: string;
  client_id: string;
  client_name: string;
  invoice_date: string;
  due_date: string | null;
  line_items: unknown;
  reimbursement_lines: unknown;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  amount_received: number;
  tds_receivable: number | null;
  outstanding?: number;
  days_overdue?: number;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ReceiptRow {
  id: string;
  receipt_date: string;
  amount: number;
  tds_amount: number | null;
  payment_mode: string | null;
  payment_reference: string | null;
  notes: string | null;
}

interface LineItem {
  description: string;
  sac_code?: string;
  amount: number;
  gst_rate?: number;
  head?: string;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch invoice list and find this one (API returns list, not single)
  const [busy, setBusy] = useState(false);
  const { data: invListData, mutate: mutateInvoice } = useSWR<{
    invoices: InvoiceDetail[];
    can_issue?: boolean;
    can_cancel?: boolean;
    can_record?: boolean;
  }>(
    `/api/invoices`,
    fetcher,
  );
  const allInvoices = Array.isArray(invListData?.invoices) ? invListData.invoices : [];
  const invoice = allInvoices.find((inv) => inv.id === id) ?? null;

  // Fetch receipts for this invoice
  const { data: rcpData, mutate: mutateReceipts } = useSWR<{ receipts: ReceiptRow[] }>(
    id ? `/api/receipts?invoice_id=${id}` : null,
    fetcher,
  );
  const receipts = Array.isArray(rcpData?.receipts) ? rcpData.receipts : [];

  const refreshAll = useCallback(() => {
    mutateInvoice();
    mutateReceipts();
  }, [mutateInvoice, mutateReceipts]);

  if (!invListData) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Invoice not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard/billing")}>
          Back to Billing
        </Button>
      </div>
    );
  }

  const outstanding = invoice.outstanding ?? Number(invoice.total_amount) - Number(invoice.amount_received);
  const isOpen = ["issued", "sent", "partially_paid", "overdue"].includes(invoice.status);
  const canRecord = !!invListData.can_record && isOpen && outstanding > 0.01;

  async function act(action: "issue" | "send" | "cancel" | "write_off") {
    const warn: Record<string, string> = {
      cancel: "Cancel this invoice? This can't be undone.",
      write_off: `Write off the remaining ${fmt(outstanding)}? This can't be undone.`,
    };
    if (warn[action] && !window.confirm(warn[action])) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "That didn't work. Please try again.");
        return;
      }
      toast.success(
        action === "issue"
          ? "Invoice issued."
          : action === "send"
            ? "Marked as sent."
            : action === "cancel"
              ? "Invoice cancelled."
              : "Balance written off.",
      );
      refreshAll();
    } finally {
      setBusy(false);
    }
  }

  // Parse line items
  let lineItems: LineItem[] = [];
  try {
    lineItems = typeof invoice.line_items === "string"
      ? JSON.parse(invoice.line_items)
      : Array.isArray(invoice.line_items)
        ? invoice.line_items as LineItem[]
        : [];
  } catch {
    lineItems = [];
  }

  let reimbLines: LineItem[] = [];
  try {
    reimbLines = typeof invoice.reimbursement_lines === "string"
      ? JSON.parse(invoice.reimbursement_lines)
      : Array.isArray(invoice.reimbursement_lines)
        ? invoice.reimbursement_lines as LineItem[]
        : [];
  } catch {
    reimbLines = [];
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/billing">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoice_number}</h1>
              <InvoiceStatusCell row={{ status: invoice.status, days_overdue: invoice.days_overdue }} value={null} />
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.billing_entity_name} → {invoice.client_name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <FileText className="size-4 mr-1" />
            Preview
          </Button>
          {invListData.can_issue && invoice.status === "draft" && (
            <Button size="sm" disabled={busy} onClick={() => act("issue")}>
              <CheckCircle2 className="size-4 mr-1" />
              Issue invoice
            </Button>
          )}
          {invListData.can_issue && invoice.status === "issued" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("send")}>
              <Send className="size-4 mr-1" />
              Mark as sent
            </Button>
          )}
          {canRecord && (
            <Button size="sm" onClick={() => setReceiptOpen(true)}>
              <Receipt className="size-4 mr-1" />
              Record Receipt
            </Button>
          )}
          {invListData.can_cancel && ["draft", "issued", "sent"].includes(invoice.status) && receipts.length === 0 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("cancel")}>
              <Ban className="size-4 mr-1" />
              Cancel
            </Button>
          )}
          {invListData.can_cancel && isOpen && outstanding > 0.01 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("write_off")}>
              <FileX className="size-4 mr-1" />
              Write off
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Invoice Date</p>
            <p className="text-sm font-medium mt-1">
              {new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Due Date</p>
            <p className="text-sm font-medium mt-1">
              {invoice.due_date
                ? new Date(invoice.due_date).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
            <p className="text-lg font-semibold tabular-nums mt-1">{fmt(Number(invoice.total_amount))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground font-medium">Outstanding</p>
            <p className={`text-lg font-semibold tabular-nums mt-1 ${outstanding > 0.01 ? "text-destructive" : ""}`}>
              {fmt(outstanding)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Professional Fee Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium">SAC</th>
                  <th className="text-right px-3 py-2 font-medium">GST</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{li.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">{li.sac_code || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{li.gst_rate ?? 18}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(li.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Reimbursements */}
      {reimbLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reimbursements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Head</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbLines.map((rl, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{rl.head || "—"}</td>
                      <td className="px-3 py-2">{rl.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(rl.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GST Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">GST Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums font-medium">{fmt(Number(invoice.subtotal))}</span>
          </div>
          {Number(invoice.cgst) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST</span>
              <span className="tabular-nums">{fmt(Number(invoice.cgst))}</span>
            </div>
          )}
          {Number(invoice.sgst) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST</span>
              <span className="tabular-nums">{fmt(Number(invoice.sgst))}</span>
            </div>
          )}
          {Number(invoice.igst) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGST</span>
              <span className="tabular-nums">{fmt(Number(invoice.igst))}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span className="tabular-nums">{fmt(Number(invoice.total_amount))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Received</span>
            <span className="tabular-nums">{fmt(Number(invoice.amount_received))}</span>
          </div>
          {Number(invoice.tds_receivable) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">TDS Receivable</span>
              <span className="tabular-nums">{fmt(Number(invoice.tds_receivable))}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Outstanding</span>
            <span className={`tabular-nums ${outstanding > 0.01 ? "text-destructive" : ""}`}>{fmt(outstanding)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Receipts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Receipts</CardTitle>
          {canRecord && (
            <Button size="sm" variant="outline" onClick={() => setReceiptOpen(true)}>
              <Receipt className="size-4 mr-1" />
              Record Receipt
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="size-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No receipts yet.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-right px-3 py-2 font-medium">TDS</th>
                    <th className="text-left px-3 py-2 font-medium">Mode</th>
                    <th className="text-left px-3 py-2 font-medium">Reference</th>
                    <th className="text-left px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        {new Date(r.receipt_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(Number(r.amount))}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {Number(r.tds_amount) > 0 ? fmt(Number(r.tds_amount)) : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize">{r.payment_mode ? String(r.payment_mode).replace(/_/g, " ") : "—"}</td>
                      <td className="px-3 py-2">{r.payment_reference || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ReceiptRecordingDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        invoiceId={invoice.id}
        clientId={invoice.client_id}
        billingEntityId={invoice.billing_entity_id}
        outstanding={outstanding}
        onSuccess={refreshAll}
      />

      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        invoice={invoice as never}
      />
    </div>
  );
}
