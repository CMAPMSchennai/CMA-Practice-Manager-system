"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const ESCALATION_LABELS: Record<number, { label: string; tone: StatusTone }> = {
  0: { label: "None", tone: "neutral" },
  1: { label: "Level 1", tone: "warn" },
  2: { label: "Level 2", tone: "urgent" },
  3: { label: "Level 3", tone: "over" },
};

export function EscalationCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const level = Number(row.escalation_level ?? 0);
  const config = ESCALATION_LABELS[level] ?? { label: `Level ${level}`, tone: "neutral" as StatusTone };
  return <StatusChip tone={config.tone}>{config.label}</StatusChip>;
}
