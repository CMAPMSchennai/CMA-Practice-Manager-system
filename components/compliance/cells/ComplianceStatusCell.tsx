"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "calm" },
  completed: { label: "Completed", tone: "ok" },
  overdue: { label: "Overdue", tone: "over" },
  not_applicable: { label: "N/A", tone: "neutral" },
};

export function ComplianceStatusCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const status = String(row.status ?? "");
  const config = STATUS[status] ?? { label: status || "—", tone: "neutral" as StatusTone };
  return <StatusChip tone={config.tone}>{config.label}</StatusChip>;
}
