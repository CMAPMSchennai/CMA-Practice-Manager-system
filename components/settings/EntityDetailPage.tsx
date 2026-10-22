"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { BankAccountForm } from "@/components/settings/BankAccountForm";
import { EntityForm } from "@/components/settings/EntityForm";
import type { BankAccountFormValues, EntityFormValues } from "@/lib/schemas/entity";
import { DocumentVault } from "@/components/documents/DocumentVault";
import { ArrowLeft, Plus, Building2, Landmark, Pencil, FileText } from "lucide-react";

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
  metadata: unknown;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface BankAccount {
  id: string;
  entity_id: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string | null;
  account_type: string;
  opening_balance: number | null;
  is_active: boolean;
  created_at: string;
  [key: string]: unknown;
}

function BankStatusCell({ row }: { row: BankAccount; value: unknown }) {
  return row.is_active ? (
    <Badge variant="default">Active</Badge>
  ) : (
    <Badge variant="secondary">Inactive</Badge>
  );
}

export function EntityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entityId = params.id as string;

  const {
    data: entData,
    isLoading: entLoading,
    error: entError,
    mutate: mutateEntity,
  } = useSWR<{ entity: Entity }>(
    entityId ? `/api/entities/${entityId}` : null,
    fetcher,
  );

  const {
    data: bankData,
    isLoading: bankLoading,
    mutate: mutateBanks,
  } = useSWR<{ bank_accounts: BankAccount[] }>(
    entityId ? `/api/entities/bank-accounts?entity_id=${entityId}` : null,
    fetcher,
  );

  const [addBankOpen, setAddBankOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const entity = entData?.entity ?? null;
  const bankAccounts = Array.isArray(bankData?.bank_accounts)
    ? bankData.bank_accounts
    : [];

  async function handleAddBank(values: BankAccountFormValues) {
    const res = await fetch("/api/entities/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "Failed to add bank account");
      throw new Error(result.error);
    }
    toast.success("Bank account added");
    mutateBanks();
    setAddBankOpen(false);
  }

  async function handleEditEntity(values: EntityFormValues) {
    const res = await fetch(`/api/entities/${entityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error || "Failed to update entity");
      throw new Error(result.error);
    }
    toast.success("Entity updated");
    mutateEntity();
    setEditOpen(false);
  }

  if (entLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (entError || !entity) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">Entity not found.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/dashboard/settings/entities")}
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to Entities
        </Button>
      </div>
    );
  }

  const editDefaults: Partial<EntityFormValues> = {
    name: entity.name,
    short_code: entity.short_code,
    pan: entity.pan ?? "",
    gstin: entity.gstin ?? "",
    address: entity.address ?? "",
    can_attest: entity.can_attest,
    is_active: entity.is_active,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/settings/entities")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {entity.name}
            </h1>
            {entity.is_active ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {entity.short_code}
            {entity.can_attest && " · Attestation-enabled"}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4 mr-2" />
          Edit Entity
        </Button>
      </div>

      <Tabs defaultValue="metadata">
        <TabsList>
          <TabsTrigger value="metadata">
            <Building2 className="size-4 mr-2" />
            Metadata
          </TabsTrigger>
          <TabsTrigger value="bank-accounts">
            <Landmark className="size-4 mr-2" />
            Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="payroll-thresholds">
            Payroll Thresholds
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="size-4 mr-2" />
            Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <DocumentVault
            ownerType="entity"
            ownerId={entityId}
            title="Firm documents"
          />
        </TabsContent>

        <TabsContent value="metadata" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Short Code
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.short_code}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    PAN
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.pan || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    GSTIN
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.gstin || "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Address
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.address || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Can Attest
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.can_attest ? "Yes" : "No"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {entity.is_active ? "Active" : "Inactive"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank-accounts" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddBankOpen(true)}>
              <Plus className="size-4 mr-2" />
              Add Bank Account
            </Button>
          </div>

          <DataTable<BankAccount>
            columns={[
              { accessorKey: "bank_name", header: "Bank" },
              { accessorKey: "account_number", header: "Account #" },
              { accessorKey: "ifsc_code", header: "IFSC" },
              { accessorKey: "account_type", header: "Type" },
              {
                accessorKey: "opening_balance",
                header: "Opening Balance",
              },
              {
                accessorKey: "is_active",
                header: "Status",
                cell: BankStatusCell,
              },
            ]}
            data={bankAccounts}
            loading={bankLoading}
            pagination
            emptyMessage="No bank accounts added yet."
          />

          <Dialog open={addBankOpen} onOpenChange={setAddBankOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Bank Account</DialogTitle>
                <DialogDescription>
                  Add a bank account for {entity.name}.
                </DialogDescription>
              </DialogHeader>
              <BankAccountForm
                entityId={entityId}
                onSubmit={handleAddBank}
              />
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="payroll-thresholds" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Payroll readiness thresholds for this entity will be configurable
                once the payroll module is activated.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Entity Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Entity</DialogTitle>
            <DialogDescription>
              Update details for {entity.name}.
            </DialogDescription>
          </DialogHeader>
          <EntityForm
            defaultValues={editDefaults}
            onSubmit={handleEditEntity}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
