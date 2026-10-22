"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const STATUS: Record<string, { label: string; tone: StatusTone; closed?: boolean }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "calm" },
  on_hold: { label: "On Hold", tone: "warn" },
  completed: { label: "Completed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral", closed: true },
};

export function EngagementStatusCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const status = String(row.status ?? "");
  const config = STATUS[status] ?? { label: status || "—", tone: "neutral" as StatusTone };
  return (
    <StatusChip tone={config.tone} icon={config.closed ? "closed" : undefined}>
      {config.label}
    </StatusChip>
  );
}
