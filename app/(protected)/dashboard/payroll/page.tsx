"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  Unlock,
  Users,
  ClipboardList,
} from "lucide-react";
import { PayrollReadinessTable } from "@/components/payroll/PayrollReadinessTable";
import { PayrollReleaseDialog } from "@/components/payroll/PayrollReleaseDialog";
import {
  DispositionActionDrawer,
  type Disposition,
} from "@/components/payroll/DispositionActionDrawer";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

interface Entity {
  id: string;
  name: string;
  short_code: string;
}

const ACTION_LABELS: Record<string, string> = {
  accept: "Reason accepted",
  counsel: "Staff counselled",
  reassign: "Reassigned",
  escalate: "Escalated to client",
  approve_handover: "Handover approved",
};

function formatDay(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Generate period options: current month ± 12 months */
function getPeriodOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    options.push({ value, label });
  }
  return options;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayrollReadinessPage() {
  const periodOptions = getPeriodOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [computing, setComputing] = useState(false);
  const [releaseRecord, setReleaseRecord] = useState<ReadinessRecord | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [dispositionRecord, setDispositionRecord] = useState<Disposition | null>(null);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("scorecard");
  const [registerView, setRegisterView] = useState<"open" | "actioned">("open");

  // Fetch entities
  const { data: entitiesData } = useSWR<{ entities: Entity[] }>(
    "/api/entities",
    fetcher
  );
  const entities = Array.isArray(entitiesData?.entities) ? entitiesData.entities : [];

  // Auto-select first entity
  useEffect(() => {
    if (entities.length > 0 && !selectedEntity) {
      setSelectedEntity(entities[0].id);
    }
  }, [entities, selectedEntity]);

  // Fetch payroll readiness for selected entity+period
  const readinessUrl =
    selectedEntity && selectedPeriod
      ? `/api/payroll-readiness?period=${selectedPeriod}&payroll_entity_id=${selectedEntity}`
      : null;
  const {
    data: readinessData,
    isLoading: readinessLoading,
    mutate: mutateReadiness,
  } = useSWR<{ readiness: ReadinessRecord[]; salary_visible?: boolean }>(readinessUrl, fetcher);
  const salaryVisible = readinessData?.salary_visible === true;
  const readiness = Array.isArray(readinessData?.readiness)
    ? readinessData.readiness
    : [];

  // Reason register (FR-59): items awaiting partner action, plus actioned history
  const {
    data: openData,
    isLoading: openLoading,
    mutate: mutateOpen,
  } = useSWR<{ dispositions: Disposition[] }>(
    "/api/delay-reason-dispositions?status=open",
    fetcher
  );
  const {
    data: actionedData,
    isLoading: actionedLoading,
    mutate: mutateActioned,
  } = useSWR<{ dispositions: Disposition[] }>(
    registerView === "actioned" ? "/api/delay-reason-dispositions?status=actioned" : null,
    fetcher
  );
  const openItems = Array.isArray(openData?.dispositions) ? openData.dispositions : [];
  const actionedItems = Array.isArray(actionedData?.dispositions)
    ? actionedData.dispositions
    : [];
  const dispositions = registerView === "open" ? openItems : actionedItems;
  const dispositionsLoading = registerView === "open" ? openLoading : actionedLoading;
  const mutateDispositions = () => {
    mutateOpen();
    mutateActioned();
  };

  // Compute readiness
  const handleCompute = useCallback(async () => {
    if (!selectedEntity || !selectedPeriod) return;
    setComputing(true);
    try {
      const res = await fetch("/api/payroll-readiness/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: selectedPeriod,
          payroll_entity_id: selectedEntity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Computation failed");
        return;
      }
      toast.success(`Payroll readiness computed for ${data.computed} employee(s)`);
      mutateReadiness();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error(message);
    } finally {
      setComputing(false);
    }
  }, [selectedEntity, selectedPeriod, mutateReadiness]);

  // Salary status summary counts
  const readyCount = readiness.filter((r) => r.salary_status === "ready").length;
  const reviewCount = readiness.filter((r) => r.salary_status === "review_needed").length;
  const holdCount = readiness.filter((r) => r.salary_status === "on_hold").length;
  const releasedCount = readiness.filter((r) => r.salary_status === "released").length;

  const handleRelease = (row: Record<string, unknown>) => {
    const rec = row as unknown as ReadinessRecord;
    if (rec.salary_status === "released") {
      toast.message("Already Released", {
        description: "This salary has already been released.",
      });
      return;
    }
    setReleaseRecord(rec);
    setReleaseOpen(true);
  };

  const handleDisposition = (d: Disposition) => {
    setDispositionRecord(d);
    setDispositionOpen(true);
  };

  const selectedEntityName = entities.find((e) => e.id === selectedEntity)?.name ?? "";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll Readiness</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly scorecard, reason register, and salary release controls
          </p>
        </div>
        <Button
          onClick={handleCompute}
          disabled={computing || !selectedEntity}
        >
          <RefreshCw className={`size-4 mr-2 ${computing ? "animate-spin" : ""}`} />
          {computing ? "Computing…" : "Compute Readiness"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-56">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger>
              <SelectValue placeholder="Select Entity" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} ({e.short_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary strip */}
      {readinessLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <CheckCircle2 className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{readyCount}</p>
                <p className="text-xs text-muted-foreground">Ready</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{reviewCount}</p>
                <p className="text-xs text-muted-foreground">Review Needed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <PauseCircle className="size-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{holdCount}</p>
                <p className="text-xs text-muted-foreground">On Hold</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                <Unlock className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{releasedCount}</p>
                <p className="text-xs text-muted-foreground">Released</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Scorecard and Reason Register */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scorecard" className="gap-2">
            <Users className="size-4" />
            Salary Scorecard
          </TabsTrigger>
          <TabsTrigger value="reasons" className="gap-2">
            <ClipboardList className="size-4" />
            Reason Register
            {openItems.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                {openItems.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Scorecard tab */}
        <TabsContent value="scorecard" className="mt-4">
          {!selectedEntity ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select an entity to view payroll readiness.
              </CardContent>
            </Card>
          ) : readiness.length === 0 && !readinessLoading ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">No Records</CardTitle>
                <CardDescription>
                  No payroll readiness records found for {selectedEntityName} in{" "}
                  {periodOptions.find((p) => p.value === selectedPeriod)?.label}.
                  Click &quot;Compute Readiness&quot; to generate.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <PayrollReadinessTable
              data={readiness}
              loading={readinessLoading}
              showSalary={salaryVisible}
              onRelease={handleRelease}
            />
          )}
        </TabsContent>

        {/* Reason Register tab */}
        <TabsContent value="reasons" className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={registerView === "open" ? "default" : "outline"}
              onClick={() => setRegisterView("open")}
            >
              Awaiting action ({openItems.length})
            </Button>
            <Button
              size="sm"
              variant={registerView === "actioned" ? "default" : "outline"}
              onClick={() => setRegisterView("actioned")}
            >
              Actioned
            </Button>
          </div>
          {dispositionsLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : dispositions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {registerView === "open"
                  ? "Nothing awaiting partner action. All logged delays have been addressed."
                  : "No partner actions recorded yet."}
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {dispositions.map((d) => (
                <Card key={d.id} className="hover:border-foreground/20 transition-colors">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {d.task_title || "Untitled Task"}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {d.reason_code ? `${d.reason_code} · ` : ""}
                          {d.reason_label || "Unknown"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {d.client_name || "—"} · {d.assignee_name || "Unassigned"}
                        {typeof d.days_late === "number" && d.days_late > 0
                          ? ` · ${d.days_late} day${d.days_late === 1 ? "" : "s"} late`
                          : ""}
                      </p>
                      {d.free_text && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {d.free_text}
                        </p>
                      )}
                      {registerView === "actioned" ? (
                        <p className="text-xs text-muted-foreground">
                          {ACTION_LABELS[d.disposition_action ?? ""] ?? d.disposition_action} by{" "}
                          {d.dispositioned_by_name || "—"} on {formatDay(d.dispositioned_at)}
                          {d.disposition_notes ? ` — ${d.disposition_notes}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Logged {formatDay(d.logged_at)}
                        </p>
                      )}
                    </div>
                    {registerView === "open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisposition(d)}
                      >
                        Take action
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Release dialog */}
      <PayrollReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        record={releaseRecord}
        onReleased={() => {
          mutateReadiness();
        }}
      />

      {/* Disposition action drawer */}
      <DispositionActionDrawer
        open={dispositionOpen}
        onOpenChange={setDispositionOpen}
        disposition={dispositionRecord}
        onDispositioned={() => {
          mutateDispositions();
          mutateReadiness();
        }}
      />
    </div>
  );
}
