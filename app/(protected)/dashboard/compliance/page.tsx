"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Calendar,
  RefreshCw,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  ChevronLeft,
  ChevronRight,
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
import {
  ComplianceDueDatesTable,
  type StatutoryDueDate,
} from "@/components/compliance/ComplianceDueDatesTable";

interface Client {
  id: string;
  name: string;
  client_code: string;
}

function getMonthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthStr: string): string {
  const [year, mon] = monthStr.split("-").map(Number);
  const date = new Date(year, mon - 1, 1);
  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ComplianceCalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(getMonthString(now));
  const [dueDates, setDueDates] = useState<StatutoryDueDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateClientId, setGenerateClientId] = useState("");
  const [generatePeriod, setGeneratePeriod] = useState(month);
  const [generating, setGenerating] = useState(false);
  const [showFiledDialog, setShowFiledDialog] = useState(false);
  const [filingItem, setFilingItem] = useState<StatutoryDueDate | null>(null);
  const [filing, setFiling] = useState(false);

  const fetchDueDates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", month);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterClient !== "all") params.set("client_id", filterClient);
      params.set("limit", "500");

      const res = await fetch(`/api/statutory-due-dates?${params.toString()}`);
      const data = await res.json();
      const rows = Array.isArray(data?.statutory_due_dates)
        ? data.statutory_due_dates
        : [];
      setDueDates(rows);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to load compliance data";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [month, filterStatus, filterClient]);

  useEffect(() => {
    fetchDueDates();
  }, [fetchDueDates]);

  useEffect(() => {
    fetch("/api/clients?limit=500")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.clients) ? d.clients : [];
        setClients(list);
      });
  }, []);

  const handleGenerateDueDates = async () => {
    if (!generateClientId || !generatePeriod) {
      toast.error("Select a client and period");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/statutory-due-dates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(generateClientId === "all" ? {} : { client_id: generateClientId }),
          period_label: generatePeriod.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to generate due dates");
        return;
      }
      toast.success(
        `Created ${data.created} due date${data.created === 1 ? "" : "s"} for ${data.clients} client${data.clients === 1 ? "" : "s"}` +
          (data.already_there ? `; ${data.already_there} were already there` : ""),
      );
      setShowGenerate(false);
      setGenerateClientId("");
      fetchDueDates();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to generate due dates";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const [checking, setChecking] = useState(false);
  const handleCheckEscalations = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/statutory-due-dates/escalate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Couldn't check escalations");
        return;
      }
      toast.success(
        `${data.marked_overdue} marked overdue, ${data.escalated} moved up a step, ${data.notified} notification${data.notified === 1 ? "" : "s"} sent`,
      );
      fetchDueDates();
    } catch {
      toast.error("Couldn't check escalations");
    } finally {
      setChecking(false);
    }
  };

  const handleMarkFiled = (item: StatutoryDueDate) => {
    setFilingItem(item);
    setShowFiledDialog(true);
  };

  const confirmFileFiling = async () => {
    if (!filingItem) return;
    setFiling(true);
    try {
      const res = await fetch(`/api/statutory-due-dates/${filingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "filed",
          completed_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to mark as filed");
        return;
      }
      toast.success("Marked as filed");
      setShowFiledDialog(false);
      setFilingItem(null);
      fetchDueDates();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to update status";
      toast.error(message);
    } finally {
      setFiling(false);
    }
  };

  const navigateMonth = (delta: number) => {
    const [year, mon] = month.split("-").map(Number);
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(getMonthString(d));
  };

  // Summary counts
  const counts = {
    total: dueDates.length,
    pending: dueDates.filter((d) => d.status === "pending").length,
    overdue: dueDates.filter((d) => d.status === "overdue").length,
    completed: dueDates.filter((d) => d.status === "completed").length,
    escalated: dueDates.filter((d) => Number(d.escalation_level) > 0).length,
  };

  // Group due dates by day for calendar view
  const dueDatesByDay: Record<number, StatutoryDueDate[]> = {};
  const [calYear, calMonth] = month.split("-").map(Number);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun

  for (const dd of dueDates) {
    if (dd.due_date) {
      const d = new Date(dd.due_date);
      const day = d.getUTCDate();
      if (!dueDatesByDay[day]) dueDatesByDay[day] = [];
      dueDatesByDay[day].push(dd);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Compliance Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Statutory due dates, escalation tracking, and filing status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchDueDates}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={handleCheckEscalations} disabled={checking}>
            <AlertTriangle className="size-4 mr-2" /> Check escalations
          </Button>
          <Button onClick={() => setShowGenerate(true)}>
            <Zap className="size-4 mr-2" /> Generate Due Dates
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Pending
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : counts.pending}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-4 text-destructive" />
              <span className="text-xs text-muted-foreground font-medium">
                Overdue
              </span>
            </div>
            <p className="text-2xl font-semibold text-destructive">
              {loading ? <Skeleton className="h-8 w-12" /> : counts.overdue}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Filed
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : counts.completed}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">
                Escalated
              </span>
            </div>
            <p className="text-2xl font-semibold text-foreground">
              {loading ? <Skeleton className="h-8 w-12" /> : counts.escalated}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Month navigator + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 border rounded-md bg-card px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium px-3 min-w-[140px] text-center text-foreground">
            {formatMonthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigateMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Filter className="size-4 text-muted-foreground" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="not_applicable">N/A</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar grid view */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {/* Empty cells before the first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[80px] bg-muted/20 rounded-sm"
              />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const items = dueDatesByDay[day] || [];
              const hasOverdue = items.some(
                (it) => it.status === "overdue" || (it.status === "pending" && new Date(it.due_date) < new Date())
              );
              const hasPending = items.some((it) => it.status === "pending");
              const allCompleted = items.length > 0 && items.every((it) => it.status === "completed");

              return (
                <div
                  key={day}
                  className={`min-h-[80px] border rounded-sm p-1 ${
                    hasOverdue
                      ? "border-destructive/40 bg-destructive/5"
                      : allCompleted
                        ? "border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10"
                        : "border-border bg-card"
                  }`}
                >
                  <span className="text-xs font-medium text-foreground">{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((it) => (
                      <div
                        key={it.id}
                        className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                          it.status === "completed"
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : it.status === "overdue" || (it.status === "pending" && new Date(it.due_date) < new Date())
                              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              : it.status === "in_progress"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : it.status === "not_applicable"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                        title={it.compliance_name}
                      >
                        {it.compliance_name}
                      </div>
                    ))}
                    {items.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{items.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Table view */}
      <ComplianceDueDatesTable
        data={dueDates}
        loading={loading}
        onMarkFiled={handleMarkFiled}
      />

      {/* Generate Due Dates Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Statutory Due Dates</DialogTitle>
            <DialogDescription>
              Generate due dates for a client based on active calendar rules and
              their service scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Client *</label>
              <Select
                value={generateClientId}
                onValueChange={setGenerateClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only returns that fit each client&apos;s services and entity type are created.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Period Label *</label>
              <p className="text-xs text-muted-foreground">
                Use 2026-10 for a month, Q2-2026 for a financial-year quarter (Q1 is Apr-Jun), H1-2026 for a
                half-year, or FY2026-27 for a year. Each label creates only the returns of that kind.
              </p>
              <input
                type="text"
                placeholder="e.g. 2026-10 or Q2-2026 or FY2026-27"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={generatePeriod}
                onChange={(e) => setGeneratePeriod(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowGenerate(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateDueDates}
                disabled={generating || !generateClientId || !generatePeriod}
              >
                {generating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Filed Confirmation Dialog */}
      <Dialog open={showFiledDialog} onOpenChange={setShowFiledDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as Filed</DialogTitle>
            <DialogDescription>
              Confirm that &quot;{filingItem?.compliance_name}&quot; for{" "}
              {filingItem?.client_name} has been filed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowFiledDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={confirmFileFiling} disabled={filing}>
              {filing ? "Filing..." : "Confirm Filed"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
