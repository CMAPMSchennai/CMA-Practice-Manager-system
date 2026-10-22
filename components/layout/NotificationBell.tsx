"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Note {
  id: string;
  subject: string | null;
  body: string | null;
  data?: unknown;
  read_at: string | null;
  created_at: string;
}

/** In-app notifications for the signed-in user: statutory escalations and similar alerts. */
export function NotificationBell() {
  const [notes, setNotes] = useState<Note[]>([]);

  const load = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { notifications?: Note[] } | null) => {
        if (d?.notifications) setNotes(d.notifications);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = notes.filter((n) => !n.read_at).length;

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          <span className="sr-only">Notifications{unread > 0 ? `, ${unread} unread` : ""}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between pr-2">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          notes.slice(0, 15).map((n) => {
            const clientId =
              n.data && typeof n.data === "object" && "client_id" in n.data
                ? String((n.data as { client_id: unknown }).client_id)
                : null;
            const inner = (
              <>
                <p className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                  {n.subject ?? "Notification"}
                </p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </>
            );
            return clientId ? (
              <Link
                key={n.id}
                href={`/dashboard/clients/${clientId}`}
                className="block px-3 py-2 border-b last:border-b-0 hover:bg-muted/50"
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="px-3 py-2 border-b last:border-b-0">
                {inner}
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
