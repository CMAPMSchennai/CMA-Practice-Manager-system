"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Bell, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Reminder {
  id: string;
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  stage: number;
  state: "pending_approval" | "approved" | "sent" | "dismissed";
  outstanding: number;
  due_date: string | null;
  days_overdue: number;
  text: string;
  decided_by_name: string | null;
}

const STATE_LABEL: Record<Reminder["state"], string> = {
  pending_approval: "Waiting for partner approval",
  approved: "Approved, ready to send",
  sent: "Sent",
  dismissed: "Dismissed",
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RemindersPanel() {
  const { data, mutate, isLoading } = useSWR<{
    reminders: Reminder[];
    can_approve: boolean;
    can_mark_sent: boolean;
    error?: string;
  }>("/api/invoices/reminders", fetcher);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "dismiss" | "mark_sent") {
    setBusyId(id);
    try {
      const res = await fetch("/api/invoices/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "That didn't work. Please try again.");
        return;
      }
      toast.success(action === "approve" ? "Approved." : action === "dismiss" ? "Dismissed." : "Marked as sent.");
      mutate();
    } finally {
      setBusyId(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Wording copied.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  const reminders = Array.isArray(data?.reminders) ? data.reminders : [];
  const shown = reminders.filter((r) => r.state !== "dismissed");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A reminder is drafted automatically once an invoice has been overdue for the number of days set in Settings. A
        Partner approves it, then it is sent to the client by hand (there is no email account connected yet) and marked
        as sent here.
      </p>
      {shown.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="size-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No payment reminders are due.</p>
        </div>
      ) : (
        shown.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">
                    {r.invoice_number} · {r.client_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reminder {r.stage} of 3 · {fmt(r.outstanding)} owed · {r.days_overdue} days overdue
                  </p>
                </div>
                <Badge variant={r.state === "pending_approval" ? "outline" : r.state === "approved" ? "default" : "secondary"}>
                  {STATE_LABEL[r.state]}
                </Badge>
              </div>
              <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded-md p-3 font-sans">{r.text}</pre>
              <div className="flex flex-wrap gap-2">
                {r.state === "pending_approval" && data?.can_approve && (
                  <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, "approve")}>
                    Approve
                  </Button>
                )}
                {r.state === "pending_approval" && !data?.can_approve && (
                  <span className="text-xs text-muted-foreground self-center">A Partner has to approve this one.</span>
                )}
                {r.state === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => copy(r.text)}>
                    <Copy className="size-4 mr-1" />
                    Copy wording
                  </Button>
                )}
                {r.state === "approved" && data?.can_mark_sent && (
                  <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, "mark_sent")}>
                    I have sent it
                  </Button>
                )}
                {(r.state === "pending_approval" || r.state === "approved") && data?.can_approve && (
                  <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => act(r.id, "dismiss")}>
                    Dismiss
                  </Button>
                )}
                {r.state === "sent" && r.decided_by_name && (
                  <span className="text-xs text-muted-foreground self-center">Marked sent by {r.decided_by_name}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
