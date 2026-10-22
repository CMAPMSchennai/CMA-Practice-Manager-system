"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Member {
  id: string;
  user_id: string;
  role_in_engagement: string | null;
  user_name: string | null;
  user_email: string | null;
  open_tasks: number;
}
interface Person {
  user_id: string;
  name: string;
  detail?: string;
}

const ROLE_WORDS: Record<string, string> = {
  partner: "Partner",
  manager: "Manager",
  senior: "Senior",
  associate: "Associate",
  articled_clerk: "Articled clerk",
};

/** Who is on this engagement (FR-03). Staff on the team can see the engagement. */
export function EngagementTeamPanel({
  engagementId,
  onCount,
}: {
  engagementId: string;
  onCount?: (n: number) => void;
}) {
  const [team, setTeam] = useState<Member[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/engagements/${engagementId}/team`);
      const d = (await res.json()) as { team?: Member[]; can_edit?: boolean };
      setTeam(d.team ?? []);
      setCanEdit(d.can_edit === true);
      onCount?.((d.team ?? []).length);
    } catch {
      toast.error("The team couldn't be loaded");
    }
  }, [engagementId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) return;
    Promise.all([
      fetch("/api/task-assignees").then((r) => r.json()),
      fetch("/api/task-assignees?for=reviewer").then((r) => r.json()),
    ])
      .then(([a, b]) => {
        const all = new Map<string, Person>();
        for (const x of (a.assignees ?? []) as { user_id: string; name: string; employee_id_code: string }[]) {
          all.set(x.user_id, { user_id: x.user_id, name: x.name, detail: x.employee_id_code });
        }
        for (const x of (b.reviewers ?? []) as { user_id: string; name: string; role: string }[]) {
          if (!all.has(x.user_id)) all.set(x.user_id, { user_id: x.user_id, name: x.name, detail: x.role.replace(/_/g, " ") });
        }
        setPeople([...all.values()].sort((p, q) => p.name.localeCompare(q.name)));
      })
      .catch(() => {});
  }, [canEdit]);

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: pick }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.message || d.error || "That person couldn't be added");
        return;
      }
      toast.success("Added to the team");
      setPick("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/team?user_id=${userId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.message || d.error || "That person couldn't be removed");
        return;
      }
      toast.success("Removed from the team");
      load();
    } finally {
      setBusy(false);
    }
  }

  const onTeam = new Set(team.map((m) => m.user_id));
  const addable = people.filter((p) => !onTeam.has(p.user_id));

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-72">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger aria-label="Add a team member">
                <SelectValue placeholder="Choose a person to add" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.name} {p.detail ? `(${p.detail})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={!pick || busy}>
            <UserPlus className="size-4 mr-1" /> Add to team
          </Button>
        </div>
      )}
      {team.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No one is on this engagement&apos;s team yet. People who are given a task here can also see the
            engagement.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {team.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{m.user_name ?? m.user_email}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ROLE_WORDS[m.role_in_engagement ?? ""] ?? "Team member"}</Badge>
                    <span className="text-xs text-muted-foreground">{m.open_tasks} open task(s)</span>
                  </div>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.user_name ?? "member"}`}
                    onClick={() => remove(m.user_id)}
                    disabled={busy}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
