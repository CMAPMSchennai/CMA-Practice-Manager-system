"use client";

import { Progress } from "@/components/ui/progress";

export function CompletionPctCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const raw = row.task_completion_pct;
  const pct = raw != null ? Math.round(Number(raw) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-2 w-20" />
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}
