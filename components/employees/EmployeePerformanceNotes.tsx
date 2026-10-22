"use client";

import useSWR from "swr";
import { MessageSquareWarning } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PerformanceNote {
  id: string;
  noted_at: string;
  note: string | null;
  partner_name: string | null;
  task_title: string | null;
  reason_label: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Partner counselling notes (FR-60), the start of the FR-62 performance history. */
export function EmployeePerformanceNotes({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useSWR<{ notes?: PerformanceNote[]; error?: string }>(
    `/api/employees/${employeeId}/performance-notes`,
    fetcher,
  );
  const notes = Array.isArray(data?.notes) ? data.notes : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquareWarning className="size-4" />
          Counselling Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : data?.error ? (
          <p className="text-sm text-muted-foreground">{data.error}</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No counselling notes. Notes appear here when a partner chooses &quot;Counsel
            staff&quot; on a delayed task.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-foreground">{n.note || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDay(n.noted_at)} · {n.partner_name || "Partner"}
                  {n.task_title ? ` · ${n.task_title}` : ""}
                  {n.reason_label ? ` · ${n.reason_label}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
