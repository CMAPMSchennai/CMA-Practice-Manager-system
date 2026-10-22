"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { ReferenceDataForm } from "@/components/settings/ReferenceDataForm";
import type { ReferenceDataFormValues } from "@/lib/schemas/reference-data";
import { Plus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface RefDataItem {
  id: string;
  type: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  metadata: unknown;
  [key: string]: unknown;
}

function StatusCell({ row }: { row: RefDataItem; value: unknown }) {
  return row.is_active ? (
    <Badge variant="default">Active</Badge>
  ) : (
    <Badge variant="secondary">Inactive</Badge>
  );
}

function TypeCell({ row }: { row: RefDataItem; value: unknown }) {
  return (
    <Badge variant="outline" className="font-mono text-xs">
      {row.type}
    </Badge>
  );
}

export function ReferenceDataPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{
    reference_data: RefDataItem[];
  }>("/api/reference-data", fetcher);

  const allItems = Array.isArray(data?.reference_data)
    ? data.reference_data
    : [];

  // Derive unique types for filter
  const types = Array.from(new Set(allItems.map((i) => i.type))).sort();

  const filteredItems =
    typeFilter === "all"
      ? allItems
      : allItems.filter((i) => i.type === typeFilter);

  async function handleCreate(values: ReferenceDataFormValues) {
    const res = await fetch("/api/reference-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "Failed to create reference data");
      throw new Error(result.error);
    }
    toast.success("Reference data created");
    mutate();
    setCreateOpen(false);
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">
          Failed to load reference data. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Reference Data Master
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generic lookup CRUD for all system enumerations (fee basis, entity
            types, delay reasons, etc.)
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-2" />
          Add Entry
        </Button>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
        </span>
      </div>

      <DataTable<RefDataItem>
        columns={[
          { accessorKey: "type", header: "Type", cell: TypeCell },
          { accessorKey: "code", header: "Code" },
          { accessorKey: "label", header: "Label" },
          { accessorKey: "sort_order", header: "Sort" },
          { accessorKey: "is_active", header: "Status", cell: StatusCell },
        ]}
        data={filteredItems}
        loading={isLoading}
        pagination
        globalSearch
        emptyMessage="No reference data entries found."
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Reference Data</DialogTitle>
            <DialogDescription>
              Add a new lookup entry. Type groups entries together (e.g.
              &quot;fee_basis&quot;, &quot;entity_type&quot;,
              &quot;delay_reason&quot;).
            </DialogDescription>
          </DialogHeader>
          <ReferenceDataForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
