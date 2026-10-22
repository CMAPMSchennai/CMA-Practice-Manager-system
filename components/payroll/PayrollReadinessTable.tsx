"use client";

import { DataTable } from "@/components/ui/data-table";
import { SalaryStatusCell } from "./cells/SalaryStatusCell";
import { CompletionPctCell } from "./cells/CompletionPctCell";
import {
  GrossAmountCell,
  OnTimePctCell,
  OverdueCell,
  TasksDoneCell,
} from "./cells/ScorecardCells";
import { Unlock } from "lucide-react";

interface ReadinessRecord extends Record<string, unknown> {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_id_code: string;
  salary_status: string;
  task_completion_pct: number | null;
  open_blocking_items: number;
  released_by: string | null;
  released_at: string | null;
  notes: string | null;
  tasks_assigned: number | null;
  tasks_done: number | null;
  tasks_overdue: number | null;
  on_time_pct: number | null;
  pending_acceptance: number | null;
  gross_amount: number | null;
}

interface PayrollReadinessTableProps {
  data: ReadinessRecord[];
  loading?: boolean;
  /** FR-04: salary column only for MP, Partners and Admin. */
  showSalary?: boolean;
  onRelease: (row: Record<string, unknown>) => void;
}

/** FR-57 employee scorecard for the selected month. */
export function PayrollReadinessTable({
  data,
  loading,
  showSalary = false,
  onRelease,
}: PayrollReadinessTableProps) {
  return (
    <DataTable
      columns={[
        { accessorKey: "employee_id_code", header: "Employee ID" },
        { accessorKey: "employee_name", header: "Employee" },
        { accessorKey: "tasks_done", header: "Done / Assigned", cell: TasksDoneCell },
        { accessorKey: "tasks_overdue", header: "Overdue", cell: OverdueCell },
        { accessorKey: "on_time_pct", header: "On-time", cell: OnTimePctCell },
        {
          accessorKey: "task_completion_pct",
          header: "Completion",
          cell: CompletionPctCell,
        },
        { accessorKey: "open_blocking_items", header: "Blocking" },
        {
          accessorKey: "salary_status",
          header: "Salary Status",
          cell: SalaryStatusCell,
        },
        ...(showSalary
          ? [{ accessorKey: "gross_amount", header: "Amount", cell: GrossAmountCell }]
          : []),
      ]}
      data={data}
      loading={loading}
      pagination
      globalSearch
      rowActions={[
        {
          id: "release",
          label: "Release Salary",
          icon: <Unlock className="size-4" />,
          onClick: onRelease,
        },
      ]}
    />
  );
}
