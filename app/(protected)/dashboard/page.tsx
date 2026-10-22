"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { format, subMonths } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Overview, TeamRow } from "@/lib/dashboard-overview";
import { TodaySection } from "@/components/dashboard/TodaySection";
import { OverviewVisuals } from "@/components/dashboard/OverviewVisuals";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Indian numbering: ₹ 6,85,000 in full, lakh and crore for the big numerals. */
function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function Big({ value }: { value: number }) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 10_000_000) {
    return (
      <>
        {sign}₹{(abs / 10_000_000).toFixed(2)}
        <sup className="text-xs ml-0.5">Cr</sup>
      </>
    );
  }
  if (abs >= 100_000) {
    return (
      <>
        {sign}₹{(abs / 100_000).toFixed(2)}
        <sup className="text-xs ml-0.5">L</sup>
      </>
    );
  }
  return <>{`${sign}${inr(abs)}`}</>;
}

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

const STATUS_STYLE: Record<TeamRow["salary_status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-green-50 text-green-700 border-green-200" },
  review_needed: { label: "Review needed", className: "bg-amber-50 text-amber-700 border-amber-200" },
  on_hold: { label: "On hold", className: "bg-red-50 text-red-700 border-red-200" },
};

const SALARY_TONE: Record<TeamRow["salary_status"], StatusTone> = {
  ready: "ok",
  review_needed: "warn",
  on_hold: "urgent",
};

function initials(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Row({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-sm ${strong ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${strong ? "font-semibold" : "font-medium"} ${negative ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));
  const currentPeriod = format(new Date(), "yyyy-MM");

  function shift(delta: number) {
    const [y, m] = period.split("-").map(Number);
    const next = delta < 0 ? subMonths(new Date(y, m - 1, 1), 1) : new Date(y, m, 1);
    const label = format(next, "yyyy-MM");
    if (label > currentPeriod) return;
    setPeriod(label);
  }

  const { data, isLoading, error, mutate } = useSWR<Overview | { error: string }>(
    `/api/dashboard/overview?period=${period}`,
    fetcher,
  );
  const o = data && !("error" in data) ? data : null;
  const f = o?.finance ?? null;
  const maxLine = f?.revenue_lines[0]?.amount ?? 0;
  // Roles with neither finance nor team access (for example clerks) get the Today section only.
  const showFirm = !o || !!(f || o.team);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header and month selector (FR-16) */}
      {showFirm && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel(period)}. The firm figures are for the month selected. The Today section below is always about today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[120px] text-center">{monthLabel(period)}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(1)}
            disabled={period >= currentPeriod}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`size-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/dashboard/export?period=${period}`}>
              <Download className="size-4 mr-2" />
              Excel
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>
      )}

      {(error || (data && "error" in data)) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          {(data as { error: string } | undefined)?.error ?? "The dashboard couldn't be loaded."}
        </div>
      )}

      {/* The firm at a glance: tiles, attention strip and charts (UI Version 3, added feature) */}
      <OverviewVisuals o={o} period={period} loading={isLoading} />

      {/* Today: what needs you first */}
      {showFirm && <hr className="border-border" />}
      <TodaySection />
      {showFirm && <hr className="border-border" />}
      {f && <h2 className="text-lg font-semibold text-foreground">Detailed figures</h2>}

      {f && (
        <>
          {/* P&L and cash flow (FR-18, FR-19) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Profit and loss</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Income is what was invoiced in the month, before GST and reimbursements.
                </p>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1">Income</p>
                {f.revenue_lines.length === 0 && <p className="py-2 text-sm text-muted-foreground">No invoices raised this month.</p>}
                {f.revenue_lines.map((l) => (
                  <Row key={l.name} label={l.name} value={inr(l.amount)} />
                ))}
                <Row label="Total income" value={inr(f.income)} strong />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-3 pb-1">Expenses</p>
                {f.expense_lines.length === 0 && <p className="py-2 text-sm text-muted-foreground">No expenses entered this month.</p>}
                {f.expense_lines.map((l) => (
                  <Row key={l.name} label={l.name} value={inr(l.amount)} />
                ))}
                <Row label="Total expenses" value={inr(f.expenses)} strong />
                <Row label="Net profit" value={inr(f.net_profit)} strong negative={f.net_profit < 0} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Cash flow</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                <Row label="Opening cash" value={inr(f.cash.opening)} strong />
                <Row label="Collections" value={`+ ${inr(f.cash.collections)}`} />
                <Row label="Salaries paid" value={`- ${inr(f.cash.salaries)}`} />
                <Row label="Operating expenses" value={`- ${inr(f.cash.operating)}`} />
                <Row label="Statutory outflow" value={`- ${inr(f.cash.statutory)}`} />
                <Row label="Closing cash" value={inr(f.cash.closing)} strong negative={f.cash.closing < 0} />
              </CardContent>
            </Card>
          </div>

          {/* Receivables and revenue by service line (FR-20, FR-22) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Receivables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total receivable</p>
                  <p className="text-2xl font-semibold text-foreground">
                    <Big value={f.receivables.total} />
                  </p>
                  <p className="text-xs text-muted-foreground">{f.receivables.invoices_open} open invoice{f.receivables.invoices_open === 1 ? "" : "s"}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Overdue more than 60 days</p>
                  <p className={`text-lg font-semibold ${f.receivables.overdue_60 > 0 ? "text-destructive" : "text-foreground"}`}>
                    {inr(f.receivables.overdue_60)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.receivables.overdue_60_clients} client{f.receivables.overdue_60_clients === 1 ? "" : "s"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Revenue by service line</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {f.revenue_lines.length === 0 && <p className="text-sm text-muted-foreground">No invoices raised this month.</p>}
                {f.revenue_lines.slice(0, 8).map((l) => (
                  <div key={l.name}>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground">{l.name}</span>
                      <span className="tabular-nums text-muted-foreground">{inr(l.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${maxLine > 0 ? Math.max(3, (l.amount / maxLine) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Team output and salary readiness (FR-21) */}
      {o?.team && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Team output and salary readiness</CardTitle>
            <p className="text-xs text-muted-foreground">
              {o.team.ready} ready · {o.team.review_needed} review needed · {o.team.on_hold} on hold
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto print:max-h-none">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted shadow-[0_1px_0_hsl(var(--border))]">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Tasks done / assigned</th>
                    <th className="px-4 py-2 font-medium">Completion</th>
                    <th className="px-4 py-2 font-medium">Salary status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {o.team.rows.map((r) => (
                    <tr key={r.employee_id}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {initials(r.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{r.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-foreground">
                        {r.tasks_done} / {r.tasks_assigned}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-muted">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${r.completion_pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{r.completion_pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <StatusChip tone={SALARY_TONE[r.salary_status]}>{STATUS_STYLE[r.salary_status].label}</StatusChip>
                      </td>
                    </tr>
                  ))}
                  {o.team.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No active employees yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks not completed (FR-23) */}
      {o?.tasks_not_completed && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">Tasks not completed</CardTitle>
              <Badge variant={o.tasks_not_completed.blocking > 0 ? "destructive" : "secondary"}>
                {o.tasks_not_completed.blocking} blocking salary release
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {o.tasks_not_completed.total} overdue task{o.tasks_not_completed.total === 1 ? "" : "s"}. Open one to see it.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto print:max-h-none">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted shadow-[0_1px_0_hsl(var(--border))]">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Task</th>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Assignee</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {o.tasks_not_completed.rows.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 max-w-[320px]">
                        <Link
                          href={`/dashboard/engagements/${t.engagement_id}?task=${t.id}`}
                          className="font-medium text-foreground hover:underline line-clamp-2"
                        >
                          {t.title}
                        </Link>
                        {t.area && <p className="text-xs text-muted-foreground truncate">{t.area}</p>}
                      </td>
                      <td className="px-4 py-2 text-foreground">{t.client ?? "—"}</td>
                      <td className="px-4 py-2 text-foreground">{t.assignee}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-foreground">{format(new Date(t.due_date), "dd MMM yyyy")}</span>
                        <p className="text-xs text-destructive">{t.days_late} day{t.days_late === 1 ? "" : "s"} late</p>
                      </td>
                      <td className="px-4 py-2">
                        {t.reason ? (
                          <>
                            <span className="text-foreground">{t.reason}</span>
                            {t.partner_action && <p className="text-xs text-muted-foreground">{t.partner_action}</p>}
                          </>
                        ) : (
                          <span className="text-destructive">No reason logged</span>
                        )}
                        {t.blocking && <p className="text-xs text-destructive font-medium">Blocks salary release</p>}
                      </td>
                    </tr>
                  ))}
                  {o.tasks_not_completed.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nothing is overdue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && !o && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
    </div>
  );
}
