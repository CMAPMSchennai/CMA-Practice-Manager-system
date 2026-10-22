"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface ChecklistItem {
  id: string;
  checklist_item_code: string;
  label: string;
  is_complete: boolean;
  completed_at: string | null;
}

interface EmployeeChecklistPanelProps {
  employeeId: string;
  /** True when the viewer may tick items; otherwise the list is read-only. */
  canEdit?: boolean;
}

export function EmployeeChecklistPanel({ employeeId, canEdit = true }: EmployeeChecklistPanelProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/employees/${employeeId}/checklist`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch(() => toast.error("Failed to load checklist"))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const completedCount = items.filter((i) => i.is_complete).length;
  const pct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  async function toggleItem(item: ChecklistItem) {
    const newVal = !item.is_complete;
    try {
      const res = await fetch(`/api/employees/${employeeId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist_item_code: item.checklist_item_code, is_complete: newVal }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update checklist");
        return;
      }
      setItems((prev) =>
        prev.map((i) =>
          i.checklist_item_code === item.checklist_item_code
            ? { ...i, is_complete: newVal, completed_at: newVal ? new Date().toISOString() : null }
            : i
        )
      );
    } catch {
      toast.error("Failed to update checklist");
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Onboarding Checklist</CardTitle>
          <Badge variant={pct === 100 ? "default" : "secondary"}>
            {completedCount}/{items.length}
          </Badge>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => canEdit && toggleItem(item)}
            disabled={!canEdit}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
          >
            {item.is_complete ? (
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            ) : (
              <Circle className="size-4 text-muted-foreground shrink-0" />
            )}
            <span className={item.is_complete ? "line-through text-muted-foreground" : "text-foreground"}>
              {item.label}
            </span>
            {item.completed_at && (
              <Clock className="size-3 text-muted-foreground ml-auto shrink-0" />
            )}
          </button>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No checklist items found.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
