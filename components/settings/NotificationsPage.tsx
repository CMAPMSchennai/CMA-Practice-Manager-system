"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NotificationItem {
  id: string;
  channel: string;
  template: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

function StatusCell({ row }: { row: NotificationItem; value: unknown }) {
  const v: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    delivered: "default",
    sent: "default",
    pending: "secondary",
    failed: "destructive",
  };
  return (
    <Badge variant={v[row.status] ?? "outline"}>
      {row.status}
    </Badge>
  );
}

function ChannelCell({ row }: { row: NotificationItem; value: unknown }) {
  return (
    <Badge variant="outline" className="text-xs">
      {row.channel}
    </Badge>
  );
}

function DateCell({ row }: { row: NotificationItem; value: unknown }) {
  const d = row.sent_at || row.created_at;
  return (
    <span className="text-xs text-muted-foreground">
      {new Date(d).toLocaleDateString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

export function NotificationsPage() {
  const { data, error, isLoading } = useSWR<{
    notifications: NotificationItem[];
  }>("/api/notifications?recipient_id=me", fetcher);

  const notifications = Array.isArray(data?.notifications)
    ? data.notifications
    : [];

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load notifications.
      </p>
    );
  }

  return (
    <DataTable<NotificationItem>
      columns={[
        { accessorKey: "channel", header: "Channel", cell: ChannelCell },
        { accessorKey: "template", header: "Template" },
        { accessorKey: "subject", header: "Subject" },
        { accessorKey: "status", header: "Status", cell: StatusCell },
        { accessorKey: "created_at", header: "Date", cell: DateCell },
      ]}
      data={notifications}
      loading={isLoading}
      pagination
      globalSearch
      emptyMessage="No notifications yet."
    />
  );
}
