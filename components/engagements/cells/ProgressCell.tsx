"use client";

import { Progress } from "@/components/ui/progress";

export function ProgressCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const pct = Number(row.progress_pct ?? 0);
  // An engagement with no tasks has no checklist, so there is no progress to show.
  if (row.tasks_total !== undefined && Number(row.tasks_total) === 0) {
    return <span className="text-xs text-muted-foreground min-w-[100px] inline-block">No checklist</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <Progress value={pct} className="h-2 flex-1" />
      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
    </div>
  );
}
