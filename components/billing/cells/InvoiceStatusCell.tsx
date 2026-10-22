"use client";

import { StatusChip, type StatusTone } from "@/components/ui/status-chip";

const STATUS_MAP: Record<string, { label: string; tone: StatusTone; closed?: boolean }> = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Issued", tone: "calm" },
  sent: { label: "Sent", tone: "calm" },
  partially_paid: { label: "Partially Paid", tone: "warn" },
  paid: { label: "Paid", tone: "ok" },
  overdue: { label: "Overdue", tone: "over" },
  cancelled: { label: "Cancelled", tone: "neutral", closed: true },
  written_off: { label: "Written Off", tone: "neutral", closed: true },
};

export function InvoiceStatusCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const status = String(row.status ?? "");
  const mapped = STATUS_MAP[status] ?? { label: status || "—", tone: "neutral" as StatusTone };
  const days = Number(row.days_overdue) || 0;
  return (
    <span className="inline-flex items-center gap-2">
      <StatusChip tone={mapped.tone} icon={mapped.closed ? "closed" : undefined}>
        {mapped.label}
      </StatusChip>
      {days > 0 && (
        <span className="text-xs tabular-nums" style={{ color: "hsl(var(--st-over))" }}>
          {days} days overdue
        </span>
      )}
    </span>
  );
}
