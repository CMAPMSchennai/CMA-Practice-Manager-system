"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { receiptSchema, type ReceiptFormValues } from "@/lib/schemas/invoice";

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  entity_id: string;
}

export function ReceiptRecordingDialog({
  open,
  onOpenChange,
  invoiceId,
  clientId,
  billingEntityId,
  outstanding,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  clientId: string;
  billingEntityId: string;
  outstanding: number;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      invoice_id: invoiceId,
      client_id: clientId,
      receipt_date: new Date().toISOString().slice(0, 10),
      amount: 0,
      tds_amount: 0,
      payment_mode: "",
      payment_reference: "",
      bank_account_id: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        invoice_id: invoiceId,
        client_id: clientId,
        receipt_date: new Date().toISOString().slice(0, 10),
        amount: 0,
        tds_amount: 0,
        payment_mode: "",
        payment_reference: "",
        bank_account_id: "",
        notes: "",
      });
      // Fetch bank accounts for the billing entity
      fetch(`/api/entities/bank-accounts?entity_id=${billingEntityId}`)
        .then((r) => r.json())
        .then((d) => {
          const accs = Array.isArray(d?.bank_accounts) ? d.bank_accounts : [];
          setBankAccounts(accs);
        })
        .catch(() => setBankAccounts([]));
    }
  }, [open, invoiceId, clientId, billingEntityId, form]);

  async function onSubmit(values: ReceiptFormValues) {
    setSaving(true);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          bank_account_id: values.bank_account_id || null,
          payment_mode: values.payment_mode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to record receipt");
        return;
      }
      toast.success("Receipt recorded successfully");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Receipt</DialogTitle>
          <DialogDescription>
            Outstanding: ₹{outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="receipt_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tds_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TDS Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="payment_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Mode</FormLabel>
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— Select —</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference / Cheque No.</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bank_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deposited Into</FormLabel>
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— Select —</SelectItem>
                      {bankAccounts.map((ba) => (
                        <SelectItem key={ba.id} value={ba.id}>
                          {ba.bank_name} — {ba.account_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Recording…" : "Record Receipt"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
