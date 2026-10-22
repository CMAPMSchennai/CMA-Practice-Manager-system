"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, CalendarClock, CheckCircle2, Eye, ListTodo, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusTone } from "@/components/ui/status-chip";
import { UpcomingWork } from "@/components/dashboard/UpcomingWork";
import type { Today } from "@/lib/today";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.split(" ")[0];
  return first ? `${part}, ${first}` : part;
}

function Tile({
  tone,
  icon: Icon,
  value,
  label,
  hint,
  href,
}: {
  tone: StatusTone;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-lg"
        style={{ color: `hsl(var(--st-${tone}))`, backgroundColor: `hsl(var(--st-${tone}-bg))` }}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-tight text-foreground">{value}</span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="block text-xs font-medium" style={{ color: `hsl(var(--st-${tone}))` }}>
          {hint}
        </span>
      </span>
    </Link>
  );
}

const WELCOME_KEY = "cma_welcome_v1";
const WELCOME_STEPS: { id: string; label: string; href?: string }[] = [
  { id: "help", label: "Read the quick start" },
  { id: "eng", label: "Open the Engagements list", href: "/dashboard/engagements" },
  { id: "tasks", label: "Open your Tasks", href: "/dashboard/tasks" },
  { id: "word", label: "Look up a word" },
];

/** First-time checklist. Remembered in this browser only. */
function Welcome() {
  const [done, setDone] = useState<string[]>([]);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(WELCOME_KEY) ?? "{}") as { done?: string[]; hidden?: boolean };
      setDone(Array.isArray(raw.done) ? raw.done : []);
      setHidden(raw.hidden === true);
    } catch {
      setHidden(false);
    }
  }, []);

  function save(nextDone: string[], nextHidden: boolean) {
    setDone(nextDone);
    setHidden(nextHidden);
    try {
      localStorage.setItem(WELCOME_KEY, JSON.stringify({ done: nextDone, hidden: nextHidden }));
    } catch {
      /* private window: the checklist simply won't be remembered */
    }
  }

  function tick(id: string) {
    if (!done.includes(id)) save([...done, id], hidden);
    if (id === "help" || id === "word") window.dispatchEvent(new CustomEvent("cma:open-help"));
  }

  if (hidden || done.length >= WELCOME_STEPS.length) return null;
  return (
    <div className="rounded-lg border bg-muted p-4">
      <h2 className="text-base font-semibold text-foreground">Welcome. This takes about 2 minutes</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Tick these off to learn your way around.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {WELCOME_STEPS.map((s) => {
          const isDone = done.includes(s.id);
          const cls = `inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-sm ${isDone ? "text-muted-foreground line-through" : "text-foreground hover:border-primary"}`;
          const body = (
            <>
              <CheckCircle2 className={`size-4 ${isDone ? "text-[hsl(var(--st-ok))]" : "text-muted-foreground"}`} aria-hidden="true" />
              {s.label}
            </>
          );
          return s.href ? (
            <Link key={s.id} href={s.href} onClick={() => tick(s.id)} className={cls}>
              {body}
            </Link>
          ) : (
            <button key={s.id} type="button" onClick={() => tick(s.id)} className={cls}>
              {body}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {done.length} of {WELCOME_STEPS.length} done
        </span>
        <button type="button" className="underline hover:text-foreground" onClick={() => save(done, true)}>
          Hide for now
        </button>
      </div>
    </div>
  );
}

export function TodaySection() {
  const { data, isLoading, error } = useSWR<Today | { error: string }>("/api/today", fetcher);
  const t = data && !("error" in data) ? data : null;

  if (isLoading && !t) return <Skeleton className="h-48 w-full" />;
  if (error || !t) return null;

  const mine = t.scope_label === "your";
  const overdueAll = t.counts.overdue + t.counts.overdue_filings;
  const weekAll = t.counts.this_week + t.counts.week_filings;
  const both = t.has_filings ? "Tasks and filings" : "Tasks";

  return (
    <section aria-label="Today" className="space-y-4">
      <Welcome />

      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{greeting(t.name)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {overdueAll > 0
            ? `${overdueAll} ${overdueAll === 1 ? "item is" : "items are"} overdue. Everything else can wait.`
            : t.counts.open > 0
              ? "Nothing is overdue. Here is what is coming up."
              : "Nothing is waiting on you right now."}
        </p>
      </div>

      {t.next ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-l-4 p-4" style={{ borderLeftColor: "hsl(var(--cta))" }}>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{t.next.title}</h3>
            <p className="text-sm text-muted-foreground">{t.next.sub}</p>
          </div>
          <Link
            href={t.next.href}
            className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            style={{ backgroundColor: "hsl(var(--cta))", color: "hsl(var(--cta-fg))" }}
          >
            {t.next.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      ) : (
        <Card className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-6" style={{ color: "hsl(var(--st-ok))" }} aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-foreground">You are all caught up</h3>
            <p className="text-sm text-muted-foreground">New tasks will appear here as they are assigned.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile tone="over" icon={TriangleAlert} value={overdueAll} label="Overdue" hint={overdueAll > 0 ? `${both}. Each needs a reason` : "None. Good"} href="/dashboard/tasks" />
        <Tile tone="warn" icon={Eye} value={t.counts.waiting} label="Waiting for your review" hint={t.counts.waiting > 0 ? "Check and approve" : "Nothing waiting"} href="/dashboard/tasks" />
        <Tile tone="calm" icon={CalendarClock} value={weekAll} label="Due in the next 7 days" hint={`${both}. Plan these in`} href="/dashboard/tasks" />
        <Tile tone="neutral" icon={ListTodo} value={t.counts.open} label={mine ? "Your open tasks" : "Open tasks"} hint={mine ? "Assigned to you" : "Across your clients"} href="/dashboard/tasks" />
      </div>

      <UpcomingWork items={t.upcoming} hasFilings={t.has_filings} />
    </section>
  );
}
