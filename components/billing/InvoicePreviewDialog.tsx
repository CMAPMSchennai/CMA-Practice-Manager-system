"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface LineItem {
  description: string;
  sac_code?: string;
  amount: number;
  gst_rate?: number;
  head?: string;
}

interface InvoicePreviewData {
  outstanding?: number;
  invoice_number: string;
  billing_entity_name?: string;
  client_name?: string;
  invoice_date: string;
  due_date: string | null;
  line_items: LineItem[];
  reimbursement_lines?: LineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  amount_received: number;
  status: string;
  notes?: string;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: InvoicePreviewData | null;
}) {
  if (!invoice) return null;

  const lineItems: LineItem[] = Array.isArray(invoice.line_items)
    ? invoice.line_items
    : typeof invoice.line_items === "string"
      ? (() => { try { return JSON.parse(invoice.line_items); } catch { return []; } })()
      : [];

  const reimbLines: LineItem[] = Array.isArray(invoice.reimbursement_lines)
    ? invoice.reimbursement_lines
    : typeof invoice.reimbursement_lines === "string"
      ? (() => { try { return JSON.parse(invoice.reimbursement_lines as string); } catch { return []; } })()
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Invoice {invoice.invoice_number}
            <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "draft" ? "outline" : "secondary"}>
              {invoice.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {invoice.billing_entity_name} → {invoice.client_name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Invoice Date:</span>{" "}
            {new Date(invoice.invoice_date).toLocaleDateString("en-IN")}
          </div>
          <div>
            <span className="text-muted-foreground">Due Date:</span>{" "}
            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-IN") : "—"}
          </div>
        </div>

        <Separator />

        {/* Line Items */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Professional Fee Line Items</h4>
          <div className="border rounded-md overflow-hidden">
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
        </div>

        {/* Reimbursement Lines */}
        {reimbLines.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Reimbursements</h4>
            <div className="border rounded-md overflow-hidden">
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
          </div>
        )}

        <Separator />

        {/* GST Breakdown */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal (Fees)</span>
            <span className="tabular-nums">{fmt(Number(invoice.subtotal))}</span>
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
          <div className="flex justify-between font-semibold">
            <span>Outstanding</span>
            <span className="tabular-nums text-destructive">
              {fmt(invoice.outstanding ?? Number(invoice.total_amount) - Number(invoice.amount_received))}
            </span>
          </div>
        </div>

        {invoice.notes && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-1">Notes</h4>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
