"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  field_changes: Record<string, unknown> | null;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  [key: string]: unknown;
}

function ActionCell({ row }: { row: AuditLogEntry; value: unknown }) {
  const colors: Record<string, string> = {
    create: "default",
    update: "secondary",
    delete: "destructive",
    permission_change: "outline",
  };
  const variant = (colors[row.action] ?? "outline") as
    | "default"
    | "secondary"
    | "destructive"
    | "outline";
  return <Badge variant={variant}>{row.action}</Badge>;
}

function DateCell({ row }: { row: AuditLogEntry; value: unknown }) {
  return (
    <span className="text-xs text-muted-foreground">
      {new Date(row.created_at).toLocaleDateString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

export function AuditLogViewer({
  entityType,
  entityId,
}: {
  entityType?: string;
  entityId?: string;
}) {
  const [filterType, setFilterType] = useState(entityType ?? "");
  const [filterId, setFilterId] = useState(entityId ?? "");
  const [appliedType, setAppliedType] = useState(entityType ?? "");
  const [appliedId, setAppliedId] = useState(entityId ?? "");

  const params = new URLSearchParams();
  if (appliedType) params.set("entity_type", appliedType);
  if (appliedId) params.set("entity_id", appliedId);

  const { data, error, isLoading } = useSWR<{
    audit_logs: AuditLogEntry[];
  }>(`/api/audit-logs?${params.toString()}`, fetcher);

  const logs = Array.isArray(data?.audit_logs) ? data.audit_logs : [];

  function handleSearch() {
    setAppliedType(filterType);
    setAppliedId(filterId);
  }

  return (
    <div className="space-y-4">
      {!entityType && !entityId && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Entity Type</Label>
            <Input
              placeholder="e.g. clients"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entity ID</Label>
            <Input
              placeholder="UUID"
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="w-64"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={handleSearch}>
              <Search className="size-4 mr-2" />
              Search
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive">Failed to load audit logs.</p>
      ) : (
        <DataTable<AuditLogEntry>
          columns={[
            { accessorKey: "action", header: "Action", cell: ActionCell },
            { accessorKey: "entity_type", header: "Entity" },
            { accessorKey: "entity_id", header: "Entity ID" },
            { accessorKey: "user_id", header: "User" },
            {
              accessorKey: "created_at",
              header: "Timestamp",
              cell: DateCell,
            },
          ]}
          data={logs}
          loading={isLoading}
          pagination
          globalSearch
          emptyMessage="No audit log entries found."
        />
      )}
    </div>
  );
}
