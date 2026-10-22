"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  RefreshCw,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EngagementsTable, type Engagement } from "@/components/engagements/EngagementsTable";
import { EngagementForm } from "@/components/engagements/EngagementForm";
import { ExportButton } from "@/components/reports/ExportButton";
import type { EngagementFormValues } from "@/lib/schemas/engagement";

interface Entity {
  id: string;
  name: string;
  short_code: string;
}

export default function EngagementsPage() {
  const router = useRouter();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterKind, setFilterKind] = useState("all");

  const fetchEngagements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterEntity !== "all") params.set("entity_id", filterEntity);
      if (filterKind !== "all") params.set("kind", filterKind);
      params.set("limit", "500");

      const res = await fetch(`/api/engagements?${params.toString()}`);
      const data = await res.json();
      const rows = Array.isArray(data?.engagements) ? data.engagements : [];
      setEngagements(rows);
      setCanCreate(data?.can_create === true);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to load engagements";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterEntity, filterKind]);

  useEffect(() => {
    fetchEngagements();
  }, [fetchEngagements]);

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.entities) ? d.entities : [];
        setEntities(list);
      });
  }, []);

  const handleCreate = async (values: EngagementFormValues) => {
    const res = await fetch("/api/engagements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error || data?.message || "Failed to create engagement";
      toast.error(msg);
      throw new Error(msg);
    }
    toast.success(`Engagement ${data.engagement_code} created`);
    setShowCreate(false);
    fetchEngagements();
  };

  const [generatingNext, setGeneratingNext] = useState(false);
  const handleGenerateNext = async () => {
    setGeneratingNext(true);
    try {
      const res = await fetch("/api/engagements/recurring/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Couldn't check recurring engagements");
        return;
      }
      const made = Array.isArray(data.created) ? data.created.length : 0;
      if (made > 0) {
        toast.success(
          `Created ${made} engagement${made === 1 ? "" : "s"} for the next period: ${data.created
            .map((c: { engagement_code: string }) => c.engagement_code)
            .join(", ")}`,
        );
        fetchEngagements();
      } else {
        toast.info("Nothing to create yet. No recurring engagement is within its lead time.");
      }
      if (Array.isArray(data.problems) && data.problems.length > 0) {
        toast.error(data.problems[0]);
      }
    } catch {
      toast.error("Couldn't check recurring engagements");
    } finally {
      setGeneratingNext(false);
    }
  };

  const statusCounts = {
    total: engagements.length,
    draft: engagements.filter((e) => e.status === "draft").length,
    active: engagements.filter((e) => e.status === "active").length,
    completed: engagements.filter((e) => e.status === "completed").length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Engagements
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage client engagements, team assignments, and progress tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchEngagements}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <ExportButton report="engagement_status" params={{ to: "2100-12-31", entity_id: filterEntity !== "all" ? filterEntity : undefined }} />
          {canCreate && (
            <Button variant="outline" onClick={handleGenerateNext} disabled={generatingNext}>
              <RefreshCw className={`size-4 mr-2 ${generatingNext ? "animate-spin" : ""}`} />
              Generate next periods
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="size-4 mr-2" /> New Engagement
            </Button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total</p>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : statusCounts.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Draft</p>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : statusCounts.draft}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Active</p>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : statusCounts.active}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Completed</p>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : statusCounts.completed}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="size-4 text-muted-foreground" />
        <div className="inline-flex rounded-md border overflow-hidden">
          {[
            ["all", "All"],
            ["recurring", "Recurring"],
            ["one_time", "One-time"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilterKind(value)}
              className={`px-3 py-1.5 text-sm ${filterKind === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.short_code} — {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <EngagementsTable
        data={engagements}
        loading={loading}
        onView={(row) => router.push(`/dashboard/engagements/${row.id}`)}
      />

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Engagement</DialogTitle>
            <DialogDescription>
              Create a new client engagement with service type and billing entity.
            </DialogDescription>
          </DialogHeader>
          <EngagementForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
