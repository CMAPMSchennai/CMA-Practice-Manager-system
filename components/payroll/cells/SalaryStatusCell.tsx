"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone }> = {
  ready: { label: "Ready", tone: "ok" },
  review_needed: { label: "Review Needed", tone: "warn" },
  on_hold: { label: "On Hold", tone: "urgent" },
  released: { label: "Released", tone: "calm" },
};

export function SalaryStatusCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const status = String(row.salary_status ?? "");
  const config = STATUS_CONFIG[status] ?? { label: status || "—", tone: "neutral" as StatusTone };
  return <StatusChip tone={config.tone}>{config.label}</StatusChip>;
}
