"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, BadgeCheck, CheckCircle2, FilePlus2, FolderKanban, Receipt, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ActivityEvent, ActivityKind } from "@/lib/activity-feed";

const ICONS: Record<ActivityKind, LucideIcon> = {
  task: ArrowRightLeft,
  done: CheckCircle2,
  engagement: FolderKanban,
  invoice: Receipt,
  receipt: Receipt,
  document: FilePlus2,
  client: UserCheck,
  review: ShieldCheck,
};

const TONES: Record<ActivityKind, string> = {
  task: "calm",
  done: "ok",
  engagement: "calm",
  invoice: "warn",
  receipt: "ok",
  document: "neutral",
  client: "calm",
  review: "warn",
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

/** What the team has just done, newest first. New events slide in while the page is open. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const added = events.filter((e) => !seen.current!.has(e.id)).map((e) => e.id);
    seen.current = ids;
    if (added.length > 0) {
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [events]);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
          <p className="mb-2 text-xs text-muted-foreground">What the team has done, newest first. It refreshes by itself.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "hsl(var(--st-ok))" }}>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: "hsl(var(--st-ok))" }} />
            <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: "hsl(var(--st-ok))" }} />
          </span>
          Live
        </span>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing has happened yet. New work will show up here.</p>
      ) : (
        <ul className="max-h-[26rem] overflow-y-auto pr-1">
          {events.map((e, i) => {
            const Icon = e.kind === "done" && e.text.startsWith("verified") ? BadgeCheck : ICONS[e.kind];
            const tone = TONES[e.kind];
            const body = (
              <>
                <span className="font-medium text-foreground">{e.who}</span> <span className="text-foreground">{e.text}</span>
                <span className="block text-xs text-muted-foreground">{ago(e.at, now)}</span>
              </>
            );
            return (
              <li
                key={e.id}
                className={`relative flex gap-3 pb-3.5 ${fresh.has(e.id) ? "animate-in fade-in slide-in-from-top-2 duration-500" : ""}`}
              >
                {i < events.length - 1 && <span className="absolute left-3 top-7 bottom-0 w-px bg-border" aria-hidden="true" />}
                <span
                  className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full"
                  style={{ color: `hsl(var(--st-${tone}))`, backgroundColor: `hsl(var(--st-${tone}-bg))` }}
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 text-sm">
                  {e.href ? (
                    <Link href={e.href} className="hover:underline">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
