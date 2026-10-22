"use client";

import { Eye } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { InvoiceStatusCell } from "./cells/InvoiceStatusCell";
import { AmountCell } from "./cells/AmountCell";

export interface InvoiceRow extends Record<string, unknown> {
  id: string;
  invoice_number: string;
  client_name: string;
  billing_entity_name: string;
  engagement_codes?: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  gst_total?: number;
  total_amount: number;
  amount_received: number;
  outstanding?: number;
  days_overdue?: number;
  status: string;
}

export function InvoicesTable({
  data,
  loading,
  onView,
}: {
  data: InvoiceRow[];
  loading?: boolean;
  onView: (row: InvoiceRow) => void;
}) {
  return (
    <DataTable<InvoiceRow>
      columns={[
        { accessorKey: "invoice_number", header: "Invoice no." },
        { accessorKey: "client_name", header: "Client" },
        {
          accessorKey: "engagement_codes",
          header: "Engagement",
          cell: ({ value }: { row: InvoiceRow; value: unknown }) => (value ? String(value) : "—"),
        },
        { accessorKey: "total_amount", header: "Amount", cell: AmountCell as never },
        { accessorKey: "gst_total", header: "GST", cell: AmountCell as never },
        { accessorKey: "status", header: "Status", cell: InvoiceStatusCell },
      ]}
      data={data}
      loading={loading}
      pagination
      globalSearch
      rowActions={[
        {
          id: "view",
          label: "View",
          icon: <Eye className="size-4" />,
          onClick: onView,
        },
      ]}
    />
  );
}
