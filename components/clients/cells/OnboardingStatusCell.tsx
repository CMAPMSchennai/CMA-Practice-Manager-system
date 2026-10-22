"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  imported: { label: "Imported", tone: "neutral" },
  kyc_and_docs: { label: "KYC & Docs", tone: "calm" },
  conflict_check: { label: "Conflict Check", tone: "warn" },
  engagement_letter: { label: "Engagement Letter", tone: "calm" },
  activated: { label: "Activated", tone: "ok" },
};

export function OnboardingStatusCell({ value }: { value: unknown; row?: unknown }) {
  const status = String(value ?? "");
  const config = STATUS[status] ?? { label: status, tone: "neutral" as StatusTone };
  return <StatusChip tone={config.tone}>{config.label}</StatusChip>;
}
