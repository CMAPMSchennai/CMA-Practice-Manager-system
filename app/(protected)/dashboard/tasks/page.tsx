"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ClipboardCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface BoardTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  assignee_name: string | null;
  reviewer_name: string | null;
  delay_reason: string | null;
  overdue: boolean;
}
interface BoardEngagement {
  id: string;
  engagement_code: string;
  service: string | null;
  client: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  total: number;
  done: number;
  overdue: number;
  tasks: BoardTask[];
  more: number;
}
interface Kpis {
  tasks_this_month: number;
  on_time: number;
  on_time_pct: number | null;
  overdue: number;
  overdue_with_reason: number;
  avg_turnaround_days: number | null;
  turnaround_sample: number;
  target_days: number;
}
interface Board {
  month: string;
  mine: boolean;
  doer_role: boolean;
  kpis: Kpis;
  engagements: BoardEngagement[];
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  under_review: "Under review",
  returned: "Returned",
  blocked: "Blocked",
  completed: "Completed",
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

function date(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      title={name ?? "Not assigned"}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium"
    >
      {initials(name)}
    </span>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [mine, setMine] = useState<boolean | null>(null);
  const [data, setData] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ month });
      if (mine !== null) p.set("mine", mine ? "1" : "0");
      const res = await fetch(`/api/tasks/board?${p}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "The task board could not be loaded.");
        return;
      }
      setData(json);
      if (mine === null) setMine(!!json.mine);
      // Engagements with late work start open.
      setOpen((prev) => (prev.size ? prev : new Set(json.engagements.filter((e: BoardEngagement) => e.overdue > 0).map((e: BoardEngagement) => e.id))));
    } catch (err) {
      toast.error(`The task board could not be loaded. (${err instanceof Error ? err.message : "unexpected reply"})`);
    } finally {
      setLoading(false);
    }
  }, [month, mine]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const k = data?.kpis;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="size-6 text-primary" />
            Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your tasks, grouped by engagement. Tap a task to open it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setMine(true)}
              className={`px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Mine
            </button>
            <button
              type="button"
              onClick={() => setMine(false)}
              className={`px-3 py-1.5 text-sm ${mine === false ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Everything I can see
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            {k ? <p className="text-2xl font-semibold tabular-nums">{k.tasks_this_month}</p> : <Skeleton className="h-8 w-12" />}
            <p className="text-xs text-muted-foreground">Tasks this month</p>
            <p className="text-xs text-muted-foreground mt-1">Due this month, plus older ones still open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {k ? (
              <p className="text-2xl font-semibold tabular-nums">
                {k.on_time}
                <span className="text-base font-normal text-muted-foreground"> / {k.tasks_this_month}</span>
              </p>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
            <p className="text-xs text-muted-foreground">Completed on time</p>
            <p className="text-xs text-muted-foreground mt-1">{k?.on_time_pct != null ? `${k.on_time_pct}%` : "Nothing due yet"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {k ? (
              <p className={`text-2xl font-semibold tabular-nums ${k.overdue > 0 ? "text-destructive" : ""}`}>{k.overdue}</p>
            ) : (
              <Skeleton className="h-8 w-12" />
            )}
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-xs text-muted-foreground mt-1">
              {k ? `${k.overdue_with_reason} with a reason logged` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {k ? (
              <p className="text-2xl font-semibold tabular-nums">
                {k.avg_turnaround_days != null ? `${k.avg_turnaround_days}` : "—"}
                <span className="text-base font-normal text-muted-foreground"> days</span>
              </p>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
            <p className="text-xs text-muted-foreground">Average turnaround</p>
            <p className="text-xs text-muted-foreground mt-1">
              {k
                ? k.avg_turnaround_days != null
                  ? `Target ${k.target_days} days · ${k.avg_turnaround_days <= k.target_days ? "within target" : "above target"}`
                  : `Target ${k.target_days} days · nothing completed yet`
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Board */}
      {loading && !data && <Skeleton className="h-48 w-full" />}
      {data && data.engagements.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {mine ? "You have no tasks. Switch to “Everything I can see” to look wider." : "No tasks to show."}
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {data?.engagements.map((e) => {
          const isOpen = open.has(e.id);
          const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
          return (
            <Card key={e.id}>
              <CardContent className="p-0">
                <button type="button" onClick={() => toggle(e.id)} className="w-full text-left px-4 py-3 flex items-start gap-3">
                  {isOpen ? <ChevronDown className="size-4 mt-1 shrink-0" /> : <ChevronRight className="size-4 mt-1 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.engagement_code}</span>
                      <span className="text-sm text-muted-foreground">{e.service}</span>
                      <Badge variant="outline" className="text-xs">{STATUS_LABEL[e.status] ?? e.status}</Badge>
                      {e.overdue > 0 && <Badge variant="destructive" className="text-xs">{e.overdue} overdue</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.client}
                      {e.period_start ? ` · ${date(e.period_start)} to ${date(e.period_end)}` : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-2 max-w-md">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {e.done}/{e.total} done
                      </span>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <ul className="border-t divide-y">
                    {e.tasks.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing open here.</li>}
                    {e.tasks.map((t) => (
                      <li
                        key={t.id}
                        className="px-4 py-2.5 flex items-start gap-3 cursor-pointer hover:bg-muted/30"
                        onClick={() => router.push(`/dashboard/engagements/${e.id}?task=${t.id}`)}
                      >
                        <Avatar name={t.assignee_name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{t.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.assignee_name ?? "Not assigned"}
                            {t.reviewer_name ? ` · reviewer ${t.reviewer_name}` : ""}
                          </p>
                          {t.delay_reason && <p className="text-xs text-muted-foreground mt-0.5">Reason logged: {t.delay_reason}</p>}
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <Badge variant={t.status === "completed" ? "secondary" : "outline"} className="text-xs">
                            {STATUS_LABEL[t.status] ?? t.status}
                          </Badge>
                          <p className={`text-xs ${t.overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {t.status === "completed" ? `Done ${date(t.completed_at)}` : t.due_date ? `${t.overdue ? "Overdue, " : "Due "}${date(t.due_date)}` : "No due date"}
                          </p>
                        </div>
                      </li>
                    ))}
                    {e.more > 0 && (
                      <li className="px-4 py-2 text-xs text-muted-foreground">…and {e.more} more. Open the engagement to see them all.</li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
        <p className="text-xs font-medium">How to read this</p>
        <p className="text-xs text-muted-foreground">
          Engagements with late work are listed first and open. “Tasks this month” counts tasks due in the month and older tasks
          still open. “Completed on time” counts those finished on or before their due date. Turnaround is the average days from a
          task being started to being completed, for tasks completed in the month.
        </p>
      </div>
    </div>
  );
}
