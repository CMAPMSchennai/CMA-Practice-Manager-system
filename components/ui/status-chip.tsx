import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Circle, Clock, Hourglass, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One status look for the whole app (UI Version 3).
 * Colour is never the only signal: every chip has an icon, a word and a border.
 *   ok       done, paid, on track
 *   calm     information, in progress
 *   warn     waiting, due soon
 *   urgent   act today
 *   over     overdue: the only solid chip, so it stands out at a glance
 *   neutral  not started, closed
 */
export type StatusTone = "ok" | "calm" | "warn" | "urgent" | "over" | "neutral";

export const STATUS_TONE_INFO: Record<StatusTone, { name: string; meaning: string }> = {
  ok: { name: "Done or on track", meaning: "Finished, paid, or nothing to worry about." },
  calm: { name: "In progress", meaning: "Being worked on, or information only." },
  warn: { name: "Waiting or due soon", meaning: "Needs a review or a decision, or is due within a week." },
  urgent: { name: "Act today", meaning: "Due within three days, blocked or sent back." },
  over: { name: "Overdue", meaning: "Past its due date. This needs a reason." },
  neutral: { name: "Not started or closed", meaning: "Nothing to do yet, or cancelled or written off." },
};

const ICONS: Record<StatusTone, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  calm: Clock,
  warn: Hourglass,
  urgent: AlertTriangle,
  over: AlertCircle,
  neutral: Circle,
};

export function StatusChip({
  tone,
  children,
  icon,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  icon?: "closed";
  className?: string;
}) {
  const Icon = icon === "closed" ? XCircle : ICONS[tone];
  const solid = tone === "over";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", className)}
      style={
        solid
          ? { color: "#fff", backgroundColor: "hsl(var(--st-over-solid))", borderColor: "hsl(var(--st-over-solid))" }
          : {
              color: `hsl(var(--st-${tone}))`,
              backgroundColor: `hsl(var(--st-${tone}-bg))`,
              borderColor: `hsl(var(--st-${tone}) / 0.45)`,
            }
      }
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
