"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Overview } from "@/lib/dashboard-overview";
import type { TrendMonth } from "@/lib/dashboard-trend";
import type { Today } from "@/lib/today";
import type { ActivityEvent } from "@/lib/activity-feed";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const C = { blue: "#2F6FB5", green: "#1F7A58", purple: "#534AB7", coral: "#D85A30", amber: "#BA7517", red: "#A3201A", grey: "#B4B2A9", navy: "#163A70" };

/** Indian numbering with lakh and crore. */
function inr(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function Kpi({ label, value, sub, color, icon, href }: { label: string; value: string; sub: React.ReactNode; color: string; icon: string; href?: string }) {
  const card = (
    <div className={`relative overflow-hidden rounded-xl border bg-card p-3.5 shadow-sm ${href ? "transition-shadow hover:shadow-md" : ""}`}>
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} aria-hidden="true" />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-md bg-muted text-[11px] font-semibold" style={{ color }} aria-hidden="true">
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold leading-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium" style={{ color }}>
        {sub}
      </p>
    </div>
  );
  // A tile with a link opens the page behind the number.
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${label}: open the details`}>
      {card}
    </Link>
  ) : (
    card
  );
}

function Attention({ tone, value, label, href }: { tone: StatusTone; value: string; label: string; href?: string }) {
  const body = (
    <div
      className="rounded-lg px-3 py-2"
      style={{ color: `hsl(var(--st-${tone}))`, backgroundColor: `hsl(var(--st-${tone}-bg))`, border: `1px solid hsl(var(--st-${tone}) / 0.35)` }}
    >
      <p className="text-xl font-semibold leading-tight">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block flex-1 min-w-[140px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded-lg">
      {body}
    </Link>
  ) : (
    <div className="flex-1 min-w-[140px]">{body}</div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {sub && <p className="mb-2 text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-2">{children}</div>
    </Card>
  );
}

/** One label and one figure per row, for the plain-number panels. */
function Row({ label, value, strong, note }: { label: string; value: string; strong?: boolean; note?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${strong ? "border-t font-semibold text-foreground" : "text-foreground"}`}>
      <span className={strong ? "" : "text-muted-foreground"}>
        {label}
        {note && <span className="ml-1.5 text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

const SALARY: Record<string, { label: string; tone: StatusTone; color: string }> = {
  ready: { label: "Ready", tone: "ok", color: C.green },
  review_needed: { label: "Review needed", tone: "warn", color: C.amber },
  on_hold: { label: "On hold", tone: "urgent", color: C.red },
};

function initials(name: string): string {
  const p = name.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** Everyone on the team: tasks done, progress and whether their salary can be released. */
function TeamPanel({ team }: { team: NonNullable<Overview["team"]> }) {
  const [view, setView] = useState<"all" | "attention" | "ready">("all");
  const rows = team.rows.filter((r) => (view === "all" ? true : view === "ready" ? r.salary_status === "ready" : r.salary_status !== "ready"));
  const done = team.rows.reduce((s, r) => s + r.tasks_done, 0);
  const assigned = team.rows.reduce((s, r) => s + r.tasks_assigned, 0);
  const attention = team.review_needed + team.on_hold;
  const tabs: { key: "all" | "attention" | "ready"; label: string; n: number }[] = [
    { key: "all", label: "Everyone", n: team.rows.length },
    { key: "attention", label: "Needs attention", n: attention },
    { key: "ready", label: "Ready", n: team.ready },
  ];

  return (
    <Panel
      title="Team this month"
      sub={`${team.rows.length} people · ${done} of ${assigned} tasks done. The salary chip says whether pay can be released.`}
    >
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter the team">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => setView(t.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${view === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:border-primary"}`}
          >
            {t.label} ({t.n})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nobody in this group.</p>
      ) : (
        <ul className="max-h-[26rem] divide-y overflow-y-auto pr-1">
          {rows.map((r) => {
            const s = SALARY[r.salary_status] ?? SALARY.ready;
            return (
              <li key={r.employee_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground" aria-hidden="true">
                  {initials(r.name)}
                </span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate text-sm font-medium text-foreground">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.role || "Team member"}</span>
                </span>
                <span className="flex w-full items-center gap-2 sm:w-56">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.completion_pct}% of tasks done`}>
                    <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, r.completion_pct)}%`, backgroundColor: s.color }} />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {r.tasks_done} of {r.tasks_assigned} done
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <StatusChip tone={s.tone}>{s.label}</StatusChip>
                  {r.blocking_items > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {r.blocking_items} late task{r.blocking_items === 1 ? "" : "s"} holding pay
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The firm overview as plain numbers: the first thing the Managing Partner sees. No charts. */
export function OverviewVisuals({ o, period, loading }: { o: Overview | null; period: string; loading: boolean }) {
  const f = o?.finance ?? null;
  const { data: trendData } = useSWR<{ months: TrendMonth[] } | { error: string }>(f ? `/api/dashboard/trend?period=${period}` : null, fetcher);
  const { data: todayData } = useSWR<Today | { error: string }>("/api/today", fetcher);
  // The live activity feed is for the Managing Partner and Admin; for others the call is refused and nothing shows.
  const { data: actData } = useSWR<{ events: ActivityEvent[] } | { error: string }>("/api/activity", fetcher, { refreshInterval: 20_000 });
  const events = actData && "events" in actData ? actData.events : null;
  const months = trendData && "months" in trendData ? trendData.months : null;
  const today = todayData && !("error" in todayData) ? todayData : null;

  if (loading && !o) return <Skeleton className="h-64 w-full" />;
  if (!o) return null;
  // Firm-wide figures are for the roles that see firm finances or the team. Everyone else
  // gets the Today section only.
  if (!f && !o.team) return null;

  // Income by service line: the top five and the rest, each with its share.
  const lines = f?.revenue_lines ?? [];
  const top = lines.slice(0, 5).map((l) => ({ name: l.name, value: l.amount }));
  const rest = lines.slice(5).reduce((s, l) => s + l.amount, 0);
  const sources = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  const sourceTotal = sources.reduce((s, x) => s + x.value, 0);

  const cash = f?.cash;
  const rec = f?.receivables;
  const within = rec ? Math.max(0, rec.total - rec.overdue_60) : 0;
  const team = o.team;

  return (
    <section aria-label="Firm overview" className="space-y-4">
      {/* Coloured number tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {f && (
          <>
            <Kpi
              label="Net profit"
              href="/dashboard/finance"
              icon="₹"
              color={f.net_profit < 0 ? C.red : C.green}
              value={inr(f.net_profit)}
              sub={f.mom_pct !== null ? `${f.mom_pct >= 0 ? "▲" : "▼"} ${Math.abs(f.mom_pct)}% on last month` : "No earlier month to compare"}
            />
            <Kpi
              label="Revenue billed"
              href="/dashboard/billing"
              icon="↗"
              color={C.blue}
              value={inr(f.income)}
              sub={`Collected ${inr(f.collected)}${f.realisation_pct !== null ? ` · ${f.realisation_pct}%` : ""}`}
            />
            <Kpi
              label="Closing cash"
              href="/dashboard/finance"
              icon="◎"
              color={f.cash.closing < 0 ? C.red : C.purple}
              value={inr(f.cash.closing)}
              sub={`Net ${f.cash.net_inflow >= 0 ? "inflow" : "outflow"} ${inr(Math.abs(f.cash.net_inflow))}`}
            />
            <Kpi
              label="Owed to the firm"
              href="/dashboard/billing"
              icon="!"
              color={f.receivables.overdue_60 > 0 ? C.coral : C.green}
              value={inr(f.receivables.total)}
              sub={f.receivables.overdue_60 > 0 ? `${inr(f.receivables.overdue_60)} over 60 days` : "Nothing over 60 days"}
            />
          </>
        )}
        <Kpi
          label="Team utilisation"
          href="/dashboard/tasks"
          icon="%"
          color={C.navy}
          value={`${o.utilisation.pct}%`}
          sub={`${o.utilisation.staff_count} staff · ${o.utilisation.tasks_closed}/${o.utilisation.tasks_total} tasks closed`}
        />
      </div>
      {!f && <p className="text-sm text-muted-foreground">Firm finances are shown to the Managing Partner, Partners and Admin.</p>}

      {/* What needs attention */}
      <div className="flex flex-wrap gap-2">
        {today && <Attention tone={today.counts.overdue > 0 ? "over" : "ok"} value={String(today.counts.overdue)} label="Overdue tasks" href="/dashboard/tasks" />}
        {today && <Attention tone={today.counts.waiting > 0 ? "warn" : "ok"} value={String(today.counts.waiting)} label="Waiting for your approval" href="/dashboard/tasks" />}
        {team && <Attention tone={team.on_hold > 0 ? "urgent" : "ok"} value={String(team.on_hold)} label="Salaries on hold" href="/dashboard/payroll" />}
        {rec && <Attention tone={rec.overdue_60 > 0 ? "warn" : "ok"} value={inr(rec.overdue_60)} label={`Bills over 60 days${rec.overdue_60_clients ? ` · ${rec.overdue_60_clients} client${rec.overdue_60_clients === 1 ? "" : "s"}` : ""}`} href="/dashboard/billing" />}
      </div>

      {f && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Panel title="Income and expenses" sub="The last six months, newest first.">
                {months ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1.5 pr-3 font-medium">Month</th>
                          <th className="py-1.5 px-3 text-right font-medium">Income</th>
                          <th className="py-1.5 px-3 text-right font-medium">Expenses</th>
                          <th className="py-1.5 pl-3 text-right font-medium">Net profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...months].reverse().map((m) => (
                          <tr key={m.period} className="border-t text-foreground">
                            <td className="py-1.5 pr-3">{monthLabel(m.period)}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{inr(m.income)}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{inr(m.expenses)}</td>
                            <td className="py-1.5 pl-3 text-right tabular-nums font-medium">{inr(m.net_profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </Panel>
            </div>
            <div className="lg:col-span-2">
              <Panel title="Where income comes from" sub="By service line this month">
                {sources.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No invoices raised this month.</p>
                ) : (
                  <div className="divide-y">
                    {sources.map((s) => (
                      <Row
                        key={s.name}
                        label={s.name}
                        value={inr(s.value)}
                        note={sourceTotal > 0 ? `${Math.round((s.value / sourceTotal) * 100)}%` : undefined}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Cash flow" sub="From opening to closing cash this month.">
              {cash && (
                <div>
                  <Row label="Opening cash" value={inr(cash.opening)} />
                  <Row label="Collections (money in)" value={`+ ${inr(cash.collections)}`} />
                  <Row label="Salaries" value={`- ${inr(cash.salaries)}`} />
                  <Row label="Operating costs" value={`- ${inr(cash.operating)}`} />
                  <Row label="Statutory payments" value={`- ${inr(cash.statutory)}`} />
                  <Row label="Closing cash" value={inr(cash.closing)} strong />
                </div>
              )}
            </Panel>

            <Panel title="Money owed to the firm" sub={rec ? `${rec.invoices_open} open bill${rec.invoices_open === 1 ? "" : "s"}` : undefined}>
              {rec && rec.total > 0 ? (
                <div>
                  <Row label="Within 60 days" value={inr(within)} />
                  <Row label="Over 60 days" value={inr(rec.overdue_60)} note={rec.overdue_60_clients ? `${rec.overdue_60_clients} client${rec.overdue_60_clients === 1 ? "" : "s"}` : undefined} />
                  <Row label="Total owed" value={inr(rec.total)} strong />
                </div>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">No open bills.</p>
              )}
              <div className="mt-4">
                <Row
                  label="Collected from what was billed this month"
                  value={f.realisation_pct !== null ? `${f.realisation_pct}%` : "—"}
                  strong
                />
              </div>
            </Panel>
          </div>
        </>
      )}

      {(team && team.rows.length > 0) || events ? (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-5">
          {team && team.rows.length > 0 && (
            <div className={events ? "lg:col-span-3" : "lg:col-span-5"}>
              <TeamPanel team={team} />
            </div>
          )}
          {events && (
            <div className={team && team.rows.length > 0 ? "lg:col-span-2" : "lg:col-span-5"}>
              <ActivityFeed events={events} />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
