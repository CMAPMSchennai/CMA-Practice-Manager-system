"use client";

/** FR-57 scorecard cells for the payroll readiness table. */

export function TasksDoneCell({ row }: { row: Record<string, unknown>; value: unknown }) {
  const done = row.tasks_done;
  const assigned = row.tasks_assigned;
  if (typeof done !== "number" || typeof assigned !== "number") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums">
      {done}/{assigned}
    </span>
  );
}

export function OverdueCell({ value }: { row: Record<string, unknown>; value: unknown }) {
  if (typeof value !== "number") return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`tabular-nums ${value > 0 ? "font-medium text-destructive" : ""}`}>
      {value}
    </span>
  );
}

export function OnTimePctCell({ value }: { row: Record<string, unknown>; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{Math.round(Number(value) * 100)}%</span>;
}

export function GrossAmountCell({ value }: { row: Record<string, unknown>; value: unknown }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="font-medium tabular-nums">
      ₹{Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
    </span>
  );
}
