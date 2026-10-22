"use client";

import { DataTable } from "@/components/ui/data-table";
import { AmountCell } from "@/components/billing/cells/AmountCell";

export interface ExpenseRow extends Record<string, unknown> {
  id: string;
  entity_name: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  gst_amount: number | null;
  vendor_name: string | null;
  engagement_code: string | null;
}

export function ExpensesTable({
  data,
  loading,
}: {
  data: ExpenseRow[];
  loading?: boolean;
}) {
  return (
    <DataTable<ExpenseRow>
      columns={[
        {
          accessorKey: "expense_date",
          header: "Date",
          cell: ({ value }: { row: ExpenseRow; value: unknown }) => {
            const d = value ? new Date(String(value)) : null;
            return d
              ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "—";
          },
        },
        { accessorKey: "entity_name", header: "Entity" },
        { accessorKey: "category", header: "Category" },
        { accessorKey: "vendor_name", header: "Vendor" },
        { accessorKey: "amount", header: "Amount", cell: AmountCell as never },
        { accessorKey: "gst_amount", header: "GST", cell: AmountCell as never },
        { accessorKey: "engagement_code", header: "Engagement" },
      ]}
      data={data}
      loading={loading}
      pagination
      globalSearch
    />
  );
}
