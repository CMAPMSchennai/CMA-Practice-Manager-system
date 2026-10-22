"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { feeBasisLabel } from "@/lib/fee-basis";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskPanel, TASK_STATUS_LABELS, type BoardTask } from "@/components/engagements/TaskPanel";
import { EngagementTeamPanel } from "@/components/engagements/EngagementTeamPanel";
import { AreaAssignDialog } from "@/components/engagements/AreaAssignDialog";
import { EngagementLifecycle } from "@/components/engagements/EngagementLifecycle";
import { DocumentVault } from "@/components/documents/DocumentVault";

interface EngagementDetail {
  id: string;
  engagement_code: string;
  client_id: string;
  client_name: string | null;
  service_type_id: string;
  service_type_name: string | null;
  billing_entity_id: string;
  billing_entity_name: string | null;
  task_library_id: string | null;
  task_library_version_used: number | null;
  period_start: string | null;
  period_end: string | null;
  fee_basis: string | null;
  agreed_fee: number | null;
  reimbursement_heads: unknown;
  progress_pct: number;
  status: string;
  partner_in_charge_id: string | null;
  is_recurring: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** False for roles without fee visibility (§4); the fee fields then come back empty. */
  fee_visible?: boolean;
  /** TEMPORARY (Gap #46): the MP may delete a Draft engagement while testing. */
  can_delete?: boolean;
  can_manage?: boolean;
  can_partner?: boolean;
  is_mp?: boolean;
  [key: string]: unknown;
}

type TaskInstance = BoardTask;

const STATUS_VARIANTS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  active: { label: "Active", variant: "default" },
  on_hold: { label: "On Hold", variant: "secondary" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const TASK_STATUS_VARIANTS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  not_started: { label: "Not Started", variant: "outline" },
  in_progress: { label: "In Progress", variant: "default" },
  under_review: { label: "Under Review", variant: "secondary" },
  completed: { label: "Completed", variant: "secondary" },
  on_hold: { label: "On Hold", variant: "outline" },
};

export default function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [engagement, setEngagement] = useState<EngagementDetail | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [showArea, setShowArea] = useState(false);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstantiate, setShowInstantiate] = useState(false);
  const [instantiating, setInstantiating] = useState(false);
  const [libraries, setLibraries] = useState<{ id: string; name: string; version: number }[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // FR-08 / FR-48: choose the library to instantiate (manual selection; base
  // templates are hidden because their brand variants are what gets used).
  useEffect(() => {
    if (!showInstantiate) return;
    fetch("/api/task-libraries")
      .then((r) => r.json())
      .then((data: { task_libraries?: { id: string; name: string; version: number; parent_template_id: string | null; is_active: boolean }[]; error?: string }) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        const all = Array.isArray(data.task_libraries) ? data.task_libraries : [];
        const baseIds = new Set(all.map((l) => l.parent_template_id).filter(Boolean));
        const usable = all.filter((l) => l.is_active && !baseIds.has(l.id));
        setLibraries(usable);
        setSelectedLibraryId((current) =>
          current || (engagement?.task_library_id && usable.some((l) => l.id === engagement.task_library_id)
            ? engagement.task_library_id
            : ""),
        );
      })
      .catch(() => toast.error("Failed to load task libraries"));
  }, [showInstantiate, engagement?.task_library_id]);

  // `silent` refreshes in place (after a task action) without the loading skeleton.
  const fetchDetail = useCallback(async (silent?: unknown) => {
    if (!silent) setLoading(true);
    try {
      // Fetch engagement list and find the one by ID (no dedicated detail endpoint)
      const res = await fetch(`/api/engagements?limit=500`);
      const data = await res.json();
      const rows = Array.isArray(data?.engagements) ? data.engagements : [];
      const found = rows.find((e: EngagementDetail) => e.id === id);
      if (found) {
        setEngagement(found);
      }

      // Fetch tasks for this engagement
      const taskRes = await fetch(`/api/task-instances?engagement_id=${id}&limit=500`);
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const taskList = Array.isArray(taskData?.task_instances) ? taskData.task_instances : [];
        setTasks(taskList);
      }
      const teamRes = await fetch(`/api/engagements/${id}/team`);
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamCount(Array.isArray(teamData?.team) ? teamData.team.length : 0);
      }
      const docRes = await fetch(`/api/documents?owner_type=engagement&owner_id=${id}`);
      if (docRes.ok) {
        const docData = await docRes.json();
        setDocCount(Array.isArray(docData?.documents) ? docData.documents.length : 0);
      }

    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to load engagement details";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchDetail();
  }, [id, fetchDetail]);

  // Links from the dashboard open straight onto a task: ?task=<id> (once).
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current || tasks.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("task");
    if (wanted && tasks.some((t) => t.id === wanted)) {
      openedFromLink.current = true;
      setOpenTaskId(wanted);
    }
  }, [tasks]);

  const handleInstantiate = async () => {
    if (!selectedLibraryId) {
      toast.error("Choose a task library first");
      return;
    }
    setInstantiating(true);
    try {
      const res = await fetch(`/api/engagements/${id}/instantiate-library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_library_id: selectedLibraryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to instantiate library");
        return;
      }
      toast.success(`Created ${data.tasks_created} task instances`);
      setShowInstantiate(false);
      fetchDetail();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to instantiate library";
      toast.error(message);
    } finally {
      setInstantiating(false);
    }
  };

  // TEMPORARY (Gap #46): remove a Draft test engagement and its tasks.
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/engagements/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "The engagement couldn't be deleted");
        return;
      }
      toast.success(`${data.engagement_code ?? "Engagement"} deleted`);
      router.push("/dashboard/engagements");
    } catch {
      toast.error("The engagement couldn't be deleted");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center py-12">
          <ClipboardList className="size-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold text-foreground">Engagement not found</h2>
          <p className="text-sm text-muted-foreground mt-2">
            The engagement may have been deleted or you don&apos;t have access.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/engagements")}
          >
            <ArrowLeft className="size-4 mr-2" /> Back to Engagements
          </Button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_VARIANTS[engagement.status] ?? {
    label: engagement.status,
    variant: "outline" as const,
  };

  const tasksByStatus = {
    not_started: tasks.filter((t) => t.status === "not_started"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    under_review: tasks.filter((t) => t.status === "under_review"),
    returned: tasks.filter((t) => t.status === "returned"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    completed: tasks.filter((t) => t.status === "completed"),
    not_applicable: tasks.filter((t) => t.status === "not_applicable"),
  };
  // The four main columns always show; the rest only when they hold a task.
  const boardColumns = (
    ["not_started", "in_progress", "under_review", "returned", "blocked", "completed", "not_applicable"] as const
  )
    .filter((k) => ["not_started", "in_progress", "under_review", "completed"].includes(k) || tasksByStatus[k].length > 0)
    .map((k) => ({ key: k, label: TASK_STATUS_LABELS[k] ?? k, tasks: tasksByStatus[k] }));
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  // Gap #78: a job with no checklist is one ordinary task shown as a simple job card.
  const isSimple = tasks.length === 1 && tasks[0].library_area_name === "Job";
  const job = isSimple ? tasks[0] : null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const feeVisible = engagement.fee_visible !== false;

  const computedProgress =
    tasks.length > 0
      ? Math.round((tasksByStatus.completed.length / tasks.length) * 100)
      : Number(engagement.progress_pct ?? 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/engagements")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {engagement.engagement_code}
              </h1>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {engagement.client_name} · {engagement.service_type_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchDetail}
          >
            <RefreshCw className="size-4" />
          </Button>
          <EngagementLifecycle engagement={engagement} onChanged={fetchDetail} />
          {engagement.can_delete && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              Delete (test only)
            </Button>
          )}
          {tasks.length === 0 && (
            <Button onClick={() => setShowInstantiate(true)}>
              <BookOpen className="size-4 mr-2" /> Instantiate Library
            </Button>
          )}
        </div>
      </div>

      {/* Where this job is (UI Version 3) */}
      {engagement.status !== "cancelled" && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground">Where this job is</p>
            <ol className="mt-3 flex" aria-label="Job steps">
              {["Client onboarded", "Engagement signed", "Work in progress", "Review", "Completed"].map((label, i, all) => {
                const current =
                  engagement.status === "completed"
                    ? all.length
                    : engagement.status === "draft"
                      ? 1
                      : tasksByStatus.under_review.length > 0
                        ? 3
                        : 2;
                const done = i < current;
                const now = i === current;
                return (
                  <li key={label} className="relative flex-1 text-center text-xs">
                    {i < all.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-1/2 top-3.5 h-0.5 w-full"
                        style={{ backgroundColor: done ? "hsl(var(--st-ok))" : "hsl(var(--border))" }}
                      />
                    )}
                    <span
                      className="relative z-10 mx-auto mb-1 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold"
                      style={
                        done
                          ? { backgroundColor: "hsl(var(--st-ok))", borderColor: "hsl(var(--st-ok))", color: "#fff" }
                          : now
                            ? { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }
                            : { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                      }
                    >
                      {done ? <CheckCircle2 className="size-4" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className={now ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{done ? "Done" : now ? "You are here" : "Coming up"}</span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {feeVisible && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="size-4" />
                <span className="text-xs font-medium">Billing</span>
              </div>
              <p className="text-lg font-semibold text-foreground">
                {engagement.agreed_fee != null
                  ? `₹${Number(engagement.agreed_fee).toLocaleString("en-IN")}`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {engagement.billing_entity_name} · {feeBasisLabel(engagement.fee_basis)}
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-4" />
              <span className="text-xs font-medium">Period</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {engagement.period_start
                ? new Date(engagement.period_start).toLocaleDateString("en-IN", { timeZone: "UTC" })
                : "—"}{" "}
              →{" "}
              {engagement.period_end
                ? new Date(engagement.period_end).toLocaleDateString("en-IN", { timeZone: "UTC" })
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {engagement.is_recurring ? "Recurring" : "One-time"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="size-4" />
              <span className="text-xs font-medium">Progress</span>
            </div>
            {job ? (
              <>
                <p className="text-lg font-semibold text-foreground">{TASK_STATUS_LABELS[job.status] ?? job.status}</p>
                <p className="text-xs text-muted-foreground">A single job, approved by a reviewer.</p>
              </>
            ) : tasks.length === 0 ? (
              <>
                <p className="text-lg font-semibold text-foreground">No checklist</p>
                <p className="text-xs text-muted-foreground">
                  Progress is not tracked for this engagement. It has no tasks.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Progress value={computedProgress} className="h-2 flex-1" />
                  <span className="text-lg font-semibold text-foreground">
                    {computedProgress}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tasksByStatus.completed.length}/{tasks.length} tasks completed
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="size-4" />
              <span className="text-xs font-medium">Library</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {engagement.task_library_id
                ? `v${engagement.task_library_version_used ?? "—"}`
                : "No library linked"}
            </p>
            <p className="text-xs text-muted-foreground">
              {tasks.length} task instances
            </p>
          </CardContent>
        </Card>
      </div>

      {docCount === 0 && tasksByStatus.completed.length + tasksByStatus.under_review.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Work has been submitted or completed on this engagement, but no document has been filed
          yet. Open the Documents tab to add one.
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={isSimple ? "job" : "tasks"}>
        <TabsList>
          {isSimple ? (
            <TabsTrigger value="job">Job</TabsTrigger>
          ) : (
            <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          )}
          <TabsTrigger value="team">
            <Users className="size-3 mr-1" /> Team ({teamCount})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents{docCount !== null ? ` (${docCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {job && (
          <TabsContent value="job" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{job.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {job.assigned_to_name ? `Doer: ${job.assigned_to_name}` : "No doer yet"}
                      {job.reviewer_name ? ` · Reviewer: ${job.reviewer_name}` : " · No reviewer yet"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.due_date
                        ? `Due ${new Date(job.due_date).toLocaleDateString("en-IN", { timeZone: "UTC" })}`
                        : "No due date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{TASK_STATUS_LABELS[job.status] ?? job.status}</Badge>
                    <Button onClick={() => setOpenTaskId(job.id)}>Open job</Button>
                  </div>
                </div>
                <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Choose the doer and the reviewer under Open job.</li>
                  <li>The doer starts the job, files the document in the Documents tab, and submits it. It then shows as Under review.</li>
                  <li>The reviewer approves it, and the job becomes Done. Or the reviewer returns it with a reason.</li>
                </ol>
                {engagement.notes && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm text-foreground">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Notes</span>
                    {engagement.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="tasks" className="space-y-4 mt-4">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ClipboardList className="size-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">No task instances yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use &quot;Instantiate Library&quot; to create this engagement&apos;s tasks from a master
                  procedure library.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {tasks.some((t) => t.can_assign) && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowArea(true)}>
                    <Users className="size-4 mr-1" /> Assign a whole area
                  </Button>
                </div>
              )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {boardColumns.map((col) => (
                <div key={col.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {col.label}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {col.tasks.length}
                    </Badge>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {col.tasks.map((task) => {
                      const late =
                        !!task.due_date &&
                        task.status !== "completed" &&
                        task.status !== "not_applicable" &&
                        new Date(task.due_date) < todayStart;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setOpenTaskId(task.id)}
                          className="block w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Open task: ${task.title}`}
                        >
                          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                            <CardContent className="p-3 space-y-1">
                              <p className="text-xs font-medium text-foreground line-clamp-2">
                                {task.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {task.library_area_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {task.assigned_to_name ? `Doer: ${task.assigned_to_name}` : "No doer yet"}
                                {task.reviewer_name ? ` · Reviewer: ${task.reviewer_name}` : ""}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px]">
                                  {task.priority}
                                </Badge>
                                {task.due_date && (
                                  <span className={`text-[10px] ${late ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                    Due {new Date(task.due_date).toLocaleDateString("en-IN", { timeZone: "UTC" })}
                                    {late ? " · overdue" : ""}
                                  </span>
                                )}
                                {(task.is_assignee || task.is_reviewer) && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {task.is_reviewer && !task.is_assignee ? "To review" : "Yours"}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </button>
                      );
                    })}
                    {col.tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No tasks
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <EngagementTeamPanel engagementId={id} onCount={setTeamCount} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Documents added here are filed against this engagement ({engagement.client_name}), so
            there is no need to search for the client.
          </p>
          <DocumentVault
            ownerType="engagement"
            ownerId={id}
            title="Engagement documents"
            engagementCode={engagement.engagement_code}
            onChanged={() => fetchDetail(true)}
          />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Client</p>
                    <p className="text-sm text-foreground">{engagement.client_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Service Type</p>
                    <p className="text-sm text-foreground">{engagement.service_type_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Billing Entity</p>
                    <p className="text-sm text-foreground">{engagement.billing_entity_name || "—"}</p>
                  </div>
                  {feeVisible && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Fee Basis</p>
                      <p className="text-sm text-foreground">{feeBasisLabel(engagement.fee_basis)}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {feeVisible && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Agreed Fee</p>
                      <p className="text-sm text-foreground">
                        {engagement.agreed_fee != null
                          ? `₹${Number(engagement.agreed_fee).toLocaleString("en-IN")}`
                          : "—"}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Period</p>
                    <p className="text-sm text-foreground">
                      {engagement.period_start
                        ? new Date(engagement.period_start).toLocaleDateString("en-IN", { timeZone: "UTC" })
                        : "—"}{" "}
                      →{" "}
                      {engagement.period_end
                        ? new Date(engagement.period_end).toLocaleDateString("en-IN", { timeZone: "UTC" })
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Recurring</p>
                    <p className="text-sm text-foreground">{engagement.is_recurring ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground">{engagement.notes || "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* TEMPORARY (Gap #46): delete a Draft test engagement */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {engagement.engagement_code}?</DialogTitle>
            <DialogDescription>
              This removes the engagement and all {tasks.length} of its tasks, including any work recorded on
              them. It can&apos;t be undone. This button is for clearing test data and will be replaced by the
              proper cancel or archive flow.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete engagement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AreaAssignDialog
        open={showArea}
        onClose={() => setShowArea(false)}
        engagementId={id}
        areas={Object.values(
          tasks.reduce<Record<string, { name: string; total: number; unstarted: number }>>((acc, t) => {
            const name = t.library_area_name || "(no area)";
            const a = (acc[name] ??= { name, total: 0, unstarted: 0 });
            a.total += 1;
            if (t.status === "not_started") a.unstarted += 1;
            return acc;
          }, {}),
        )}
        onDone={() => fetchDetail(true)}
      />

      {/* Task panel: assign, start, submit, approve, return (FR-50, FR-51) */}
      <TaskPanel
        task={openTask}
        onClose={() => setOpenTaskId(null)}
        onChanged={() => fetchDetail(true)}
      />

      {/* Instantiate Library Confirmation Dialog */}
      <Dialog open={showInstantiate} onOpenChange={setShowInstantiate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instantiate Task Library</DialogTitle>
            <DialogDescription>
              Creates this engagement&apos;s tasks from a master procedure library, keeping the
              Area → Sub-Task → Step structure and step IDs. This can only be done once.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="instantiate-library" className="text-sm font-medium text-foreground">
              Task library
            </label>
            <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
              <SelectTrigger id="instantiate-library">
                <SelectValue placeholder="Select a library" />
              </SelectTrigger>
              <SelectContent>
                {libraries.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} (v{l.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowInstantiate(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleInstantiate} disabled={instantiating || !selectedLibraryId}>
              {instantiating ? "Creating..." : "Confirm Instantiation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
