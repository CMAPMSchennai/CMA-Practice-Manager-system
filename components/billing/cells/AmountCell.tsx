"use client";

export function AmountCell({ value }: { row: Record<string, unknown>; value: unknown }) {
  const num = Number(value);
  if (isNaN(num)) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-medium tabular-nums">
      ₹{num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
