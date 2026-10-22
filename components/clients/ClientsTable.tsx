"use client";

import { useRouter } from "next/navigation";
import { Copy, Eye } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { OnboardingStatusCell } from "./cells/OnboardingStatusCell";

export interface ClientRow {
  id: string;
  client_code: string;
  name: string;
  trade_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  onboarding_status: string;
  is_active: boolean;
  created_at: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface ClientsTableProps {
  data: ClientRow[];
  loading?: boolean;
  onGenerateLink?: (id: string) => void;
  tokenGenerating?: string | null;
}

export function ClientsTable({
  data,
  loading,
  onGenerateLink,
  tokenGenerating,
}: ClientsTableProps) {
  const router = useRouter();

  return (
    <DataTable
      columns={[
        {
          accessorKey: "name",
          header: "Client",
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as ClientRow;
            return (
              <div>
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.client_code}
                  {r.trade_name ? ` · ${r.trade_name}` : ""}
                </p>
              </div>
            );
          },
        },
        {
          accessorKey: "contact_email",
          header: "Contact",
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as ClientRow;
            return (
              <div className="text-muted-foreground">
                {r.contact_person && (
                  <p className="text-sm">{r.contact_person}</p>
                )}
                {r.contact_email && (
                  <p className="text-xs">{r.contact_email}</p>
                )}
              </div>
            );
          },
        },
        {
          accessorKey: "onboarding_status",
          header: "Onboarding Status",
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as ClientRow;
            return <OnboardingStatusCell value={r.onboarding_status} />;
          },
        },
        {
          accessorKey: "created_at",
          header: "Since",
          cell: ({ row }: { row: Record<string, unknown> }) => {
            const r = row as unknown as ClientRow;
            return (
              <span className="text-xs text-muted-foreground">
                {formatDate(r.created_at)}
              </span>
            );
          },
        },
      ]}
      data={data as unknown as Record<string, unknown>[]}
      loading={loading}
      pagination
      globalSearch
      rowActions={[
        {
          id: "kyc-link",
          label: "KYC Link",
          icon: <Copy className="size-4" />,
          onClick: (row: Record<string, unknown>) =>
            onGenerateLink?.((row as unknown as ClientRow).id),
        },
        {
          id: "view",
          label: "View",
          icon: <Eye className="size-4" />,
          onClick: (row: Record<string, unknown>) =>
            router.push(`/dashboard/clients/${(row as unknown as ClientRow).id}`),
        },
      ]}
    />
  );
}
