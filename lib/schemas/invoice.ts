import { z } from "zod";

export const GST_RATE_OPTIONS = [0, 5, 12, 18, 28] as const;
export const REIMBURSEMENT_HEAD_OPTIONS = ["ROC", "GST fees", "Travel", "Food", "Others"] as const;

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  sac_code: z.string().optional(),
  amount: z.coerce.number().min(0, "Amount must be 0 or more"),
  // Which rates are allowed is a setting (Settings > GST rates); the server checks the list.
  gst_rate: z.coerce.number().min(0, "Enter a rate from 0 to 100").max(100, "Enter a rate from 0 to 100"),
});

export const reimbursementLineSchema = z.object({
  head: z.string().min(1, "Choose a reimbursement head"),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().min(0, "Amount must be 0 or more"),
});

export const invoiceEngagementSchema = z.object({
  engagement_id: z.string().min(1, "Engagement is required"),
  amount: z.coerce.number().min(0).optional(),
});

export const invoiceSchema = z.object({
  billing_entity_id: z.string().min(1, "Billing entity is required"),
  client_id: z.string().min(1, "Client is required"),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().optional(),
  place_of_supply: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
  reimbursement_lines: z.array(reimbursementLineSchema).optional(),
  engagements: z.array(invoiceEngagementSchema).min(1, "At least one engagement is required"),
  tds_receivable: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export const receiptSchema = z.object({
  invoice_id: z.string().min(1, "Invoice is required"),
  client_id: z.string().min(1, "Client is required"),
  receipt_date: z.string().min(1, "Receipt date is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  tds_amount: z.coerce.number().min(0).optional(),
  payment_mode: z.string().optional(),
  payment_reference: z.string().optional(),
  bank_account_id: z.string().optional(),
  notes: z.string().optional(),
});

export type ReceiptFormValues = z.infer<typeof receiptSchema>;

export const expenseSchema = z.object({
  entity_id: z.string().min(1, "Entity is required"),
  expense_date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be positive"),
  gst_amount: z.coerce.number().min(0).optional(),
  paid_from_account: z.string().optional(),
  linked_engagement_id: z.string().optional(),
  vendor_name: z.string().optional(),
  payment_reference: z.string().optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;
