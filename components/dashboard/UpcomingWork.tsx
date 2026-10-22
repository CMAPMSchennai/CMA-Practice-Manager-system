"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardList, FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import type { UpcomingItem } from "@/lib/today";

const DAYS = 14;
const FIRST_ROWS = 10;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function tone(days: number): StatusTone {
  if (days < 0) return "over";
  if (days <= 3) return "urgent";
  if (days <= 7) return "warn";
  return "calm";
}

function when(days: number): string {
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

type KindFilter = "all" | "task" | "filing";

/** The next 14 days of work: a day strip, and a table of every task and filing in it. */
export function UpcomingWork({ items, hasFilings }: { items: UpcomingItem[]; hasFilings: boolean }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [day, setDay] = useState<number | "over" | null>(null);
  const [limit, setLimit] = useState(FIRST_ROWS);

  const byKind = useMemo(() => items.filter((i) => kind === "all" || i.kind === kind), [items, kind]);

  const strip = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      return { i, wd: WD[d.getDay()], date: d.getDate(), list: byKind.filter((x) => x.days === i) };
    });
  }, [byKind]);
  const overdue = byKind.filter((x) => x.days < 0);

  const rows = useMemo(() => {
    if (day === "over") return overdue;
    if (day !== null) return byKind.filter((x) => x.days === day);
    return byKind;
  }, [byKind, overdue, day]);
  const shown = rows.slice(0, limit);
  const counts = { task: items.filter((i) => i.kind === "task").length, filing: items.filter((i) => i.kind === "filing").length };

  const chips: { key: KindFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: items.length },
    { key: "task", label: "Tasks", n: counts.task },
    ...(hasFilings ? [{ key: "filing" as KindFilter, label: "Filings", n: counts.filing }] : []),
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
          Next 14 days
        </h3>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter the list">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={kind === c.key}
              onClick={() => {
                setKind(c.key);
                setLimit(FIRST_ROWS);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${kind === c.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:border-primary"}`}
            >
              {c.label} ({c.n})
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          {hasFilings ? "Every task and filing due in the next two weeks, with anything overdue first." : "Every task due in the next two weeks, with anything overdue first."} Click a day to see only that day.
        </p>

        {/* Day strip */}
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[auto_repeat(14,minmax(0,1fr))]" role="group" aria-label="Days">
          <button
            type="button"
            onClick={() => {
              setDay(day === "over" ? null : "over");
              setLimit(FIRST_ROWS);
            }}
            aria-pressed={day === "over"}
            className={`col-span-2 rounded-lg border px-2 py-1.5 text-center transition-colors sm:col-span-1 ${day === "over" ? "border-2" : ""}`}
            style={{
              color: `hsl(var(--st-${overdue.length > 0 ? "over" : "ok"}))`,
              backgroundColor: `hsl(var(--st-${overdue.length > 0 ? "over" : "ok"}-bg))`,
              borderColor: `hsl(var(--st-${overdue.length > 0 ? "over" : "ok"}) / 0.5)`,
            }}
          >
            <span className="block text-[11px] font-medium">Overdue</span>
            <span className="block text-base font-semibold leading-tight">{overdue.length}</span>
          </button>
          {strip.map((s) => {
            const worst = s.list.length ? Math.min(...s.list.map((x) => x.days)) : null;
            const t = worst !== null ? tone(worst) : null;
            return (
              <button
                key={s.i}
                type="button"
                onClick={() => {
                  setDay(day === s.i ? null : s.i);
                  setLimit(FIRST_ROWS);
                }}
                aria-pressed={day === s.i}
                className={`rounded-lg border px-1 py-1.5 text-center transition-colors hover:border-primary ${day === s.i ? "border-2 border-primary bg-muted" : s.i === 0 ? "border-primary/60" : ""}`}
              >
                <span className="block text-[10px] text-muted-foreground">{s.i === 0 ? "Today" : s.wd}</span>
                <span className="block text-sm font-semibold leading-tight text-foreground">{s.date}</span>
                <span className="mt-0.5 flex h-3 items-center justify-center gap-0.5" aria-hidden="true">
                  {s.list.slice(0, 3).map((x) => (
                    <i key={x.key} className="inline-block size-2 rounded-full" style={{ backgroundColor: `hsl(var(--st-${tone(x.days)}))` }} />
                  ))}
                </span>
                <span className="sr-only">
                  {s.list.length} due, {t ?? "none"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {day !== null ? "Nothing on that day." : "Nothing is due in the next 14 days."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Due</th>
                  <th className="px-2 py-1.5 font-medium">What</th>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium">Owner</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-t hover:bg-muted/50">
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <StatusChip tone={tone(r.days)}>{when(r.days)}</StatusChip>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{dateText(r.due_date)}</span>
                    </td>
                    <td className="max-w-[320px] px-2 py-2.5">
                      <Link href={r.href} className="block truncate font-medium text-foreground hover:underline">
                        {r.title}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{r.client ?? "No client"}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                        {r.kind === "filing" ? <FileCheck2 className="size-3.5 text-muted-foreground" aria-hidden="true" /> : <ClipboardList className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                        {r.kind === "filing" ? "Filing" : "Task"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">{r.owner ?? "Unassigned"}</td>
                    <td className="px-2 py-2.5 text-xs text-foreground">{r.status_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && (
              <div className="pt-3 text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit(limit + 20)}>
                  Show {Math.min(20, rows.length - limit)} more ({rows.length - limit} left)
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
