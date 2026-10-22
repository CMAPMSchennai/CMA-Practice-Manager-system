"use client";

import { Eye } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { EngagementStatusCell } from "./cells/EngagementStatusCell";
import { ProgressCell } from "./cells/ProgressCell";

export interface Engagement {
  id: string;
  engagement_code: string;
  client_id: string;
  client_name: string | null;
  service_type_name: string | null;
  service_line?: string | null;
  billing_entity_name: string | null;
  progress_pct: number;
  tasks_done?: number;
  tasks_total?: number;
  assigned_to_names?: string | null;
  is_recurring?: boolean;
  fee_visible?: boolean;
  status: string;
  period_start: string | null;
  period_end: string | null;
  agreed_fee: number | null;
  created_at: string;
  [key: string]: unknown;
}

interface EngagementsTableProps {
  data: Engagement[];
  loading?: boolean;
  onView: (row: Engagement) => void;
}

function shortDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function EngagementsTable({ data, loading, onView }: EngagementsTableProps) {
  // FR-44 / §4: the agreed fee column only appears for roles that may see fees.
  const showFee = data.some((d) => d.fee_visible);

  const columns = [
    { accessorKey: "engagement_code", header: "Code" },
    { accessorKey: "client_name", header: "Client" },
    {
      accessorKey: "service_type_name",
      header: "Service",
      cell: ({ row }: { row: Record<string, unknown>; value: unknown }) => {
        const r = row as unknown as Engagement;
        return (
          <div>
            <p>{r.service_type_name ?? "—"}</p>
            {r.service_line && r.service_line !== r.service_type_name && (
              <p className="text-xs text-muted-foreground">{r.service_line}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "is_recurring",
      header: "Type",
      cell: ({ row }: { row: Record<string, unknown>; value: unknown }) => (
        <span className="text-sm">{(row as unknown as Engagement).is_recurring ? "Recurring" : "One-time"}</span>
      ),
    },
    {
      accessorKey: "period_start",
      header: "Period",
      cell: ({ row }: { row: Record<string, unknown>; value: unknown }) => {
        const r = row as unknown as Engagement;
        return (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {r.period_start ? `${shortDate(r.period_start)} to ${shortDate(r.period_end)}` : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "assigned_to_names",
      header: "Assigned to",
      cell: ({ row }: { row: Record<string, unknown>; value: unknown }) => (
        <span className="text-sm text-muted-foreground">{(row as unknown as Engagement).assigned_to_names || "—"}</span>
      ),
    },
    { accessorKey: "billing_entity_name", header: "Entity" },
    { accessorKey: "status", header: "Status", cell: EngagementStatusCell },
    { accessorKey: "progress_pct", header: "Progress", cell: ProgressCell },
    ...(showFee
      ? [
          {
            accessorKey: "agreed_fee",
            header: "Agreed fee",
            cell: ({ row }: { row: Record<string, unknown>; value: unknown }) => {
              const fee = (row as unknown as Engagement).agreed_fee;
              return (
                <span className="tabular-nums text-sm whitespace-nowrap">
                  {fee != null ? `₹${Number(fee).toLocaleString("en-IN")}` : "—"}
                </span>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <DataTable
      columns={columns}
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
