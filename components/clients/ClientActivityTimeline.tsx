"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditEntry {
  id: string;
  action: string;
  field_changes: Record<string, { before: unknown; after: unknown }> | null;
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ACTION_LABELS: Record<string, string> = {
  create: "Client created",
  update: "Client details updated",
  delay_escalated_to_client: "Delay escalated to client",
  checklist_override: "Onboarding checklist overridden",
  generate_statutory_due_dates: "Statutory due dates generated",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function detail(entry: AuditEntry): string | null {
  const fc = entry.field_changes ?? {};
  if (entry.action === "delay_escalated_to_client") {
    const parts = [fc.task?.after, fc.reason?.after, fc.note?.after].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

/** Client activity from the audit trail (FR-28 Timeline). */
export function ClientActivityTimeline({
  clientId,
  createdAt,
  statusLabel,
}: {
  clientId: string;
  createdAt: string;
  statusLabel: string;
}) {
  const { data, isLoading } = useSWR<{ audit_logs?: AuditEntry[] }>(
    `/api/audit-logs?entity_type=clients&entity_id=${clientId}&limit=100`,
    fetcher,
  );
  const entries = Array.isArray(data?.audit_logs) ? data.audit_logs : [];

  const items = [
    ...entries.map((e) => ({
      id: e.id,
      title: ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " "),
      when: e.created_at,
      detail: detail(e),
    })),
    { id: "created", title: "Client created", when: createdAt, detail: `Status: ${statusLabel}` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <ol className="flex flex-col">
            {items.map((item, i) => (
              <li key={item.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="size-2.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {i < items.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatWhen(item.when)}</p>
                  {item.detail && (
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
