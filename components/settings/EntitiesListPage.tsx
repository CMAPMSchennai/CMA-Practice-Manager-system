"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { EntityForm } from "@/components/settings/EntityForm";
import type { EntityFormValues } from "@/lib/schemas/entity";
import { Plus, Eye } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Entity {
  id: string;
  name: string;
  short_code: string;
  pan: string | null;
  gstin: string | null;
  address: string | null;
  can_attest: boolean;
  is_active: boolean;
  created_at: string;
  [key: string]: unknown;
}

function StatusCell({ row }: { row: Entity; value: unknown }) {
  return row.is_active ? (
    <Badge variant="default">Active</Badge>
  ) : (
    <Badge variant="secondary">Inactive</Badge>
  );
}

function AttestCell({ row }: { row: Entity; value: unknown }) {
  return row.can_attest ? (
    <Badge variant="default">Yes</Badge>
  ) : (
    <Badge variant="outline">No</Badge>
  );
}

export function EntitiesListPage() {
  const { data, error, isLoading, mutate } = useSWR<{ entities: Entity[] }>(
    "/api/entities",
    fetcher
  );
  const [createOpen, setCreateOpen] = useState(false);

  const entities = Array.isArray(data?.entities) ? data.entities : [];

  async function handleCreate(values: EntityFormValues) {
    const res = await fetch("/api/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "Failed to create entity");
      throw new Error(result.error);
    }
    toast.success("Entity created");
    mutate();
    setCreateOpen(false);
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">
          Failed to load entities. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Entity Master
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage firm legal entities. The firm operates across three entities.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-2" />
          Add Entity
        </Button>
      </div>

      <DataTable<Entity>
        columns={[
          { accessorKey: "short_code", header: "Code" },
          { accessorKey: "name", header: "Entity Name" },
          { accessorKey: "pan", header: "PAN" },
          { accessorKey: "gstin", header: "GSTIN" },
          { accessorKey: "can_attest", header: "Attest", cell: AttestCell },
          { accessorKey: "is_active", header: "Status", cell: StatusCell },
        ]}
        data={entities}
        loading={isLoading}
        pagination
        globalSearch
        rowActions={[
          {
            id: "view",
            label: "View Details",
            icon: <Eye className="size-4" />,
            onClick: (row) => {
              window.location.href = `/dashboard/settings/entities/${row.id}`;
            },
          },
        ]}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Entity</DialogTitle>
            <DialogDescription>
              Add a new firm legal entity. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <EntityForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
