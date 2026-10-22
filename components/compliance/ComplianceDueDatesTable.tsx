"use client";

import { Eye, CheckCircle2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { ComplianceStatusCell } from "./cells/ComplianceStatusCell";
import { EscalationCell } from "./cells/EscalationCell";

export interface StatutoryDueDate {
  id: string;
  client_id: string;
  rule_id: string;
  obligation_name: string;
  compliance_name: string;
  due_date: string;
  period_label: string;
  status: string;
  escalation_level: number;
  owner_id: string | null;
  completed_at: string | null;
  notes: string | null;
  client_name: string | null;
  rule_name: string | null;
  statute: string | null;
  form_or_return: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface ComplianceDueDatesTableProps {
  data: StatutoryDueDate[];
  loading?: boolean;
  onMarkFiled: (row: StatutoryDueDate) => void;
}

function DueDateCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const dueDate = row.due_date ? new Date(String(row.due_date)) : null;
  if (!dueDate) return <span className="text-muted-foreground">—</span>;
  const now = new Date();
  const isOverdue = dueDate < now && row.status !== "completed";
  return (
    <span className={isOverdue ? "text-destructive font-medium" : "text-foreground"}>
      {dueDate.toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })}
    </span>
  );
}

const columns = [
  { accessorKey: "compliance_name", header: "Obligation" },
  { accessorKey: "client_name", header: "Client" },
  { accessorKey: "due_date", header: "Due Date", cell: DueDateCell },
  { accessorKey: "period_label", header: "Period" },
  { accessorKey: "status", header: "Status", cell: ComplianceStatusCell },
  { accessorKey: "escalation_level", header: "Escalation", cell: EscalationCell },
];

export function ComplianceDueDatesTable({ data, loading, onMarkFiled }: ComplianceDueDatesTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      pagination
      globalSearch
      rowActions={[
        {
          id: "mark_filed",
          label: "Mark Filed",
          icon: <CheckCircle2 className="size-4" />,
          onClick: onMarkFiled,
        },
      ]}
    />
  );
}
