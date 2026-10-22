"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, X, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Member {
  id: string;
  name: string;
  client_code: string | null;
}
interface Group {
  id: string;
  name: string;
  description: string | null;
  members: Member[];
}
interface ClientOption {
  id: string;
  name: string;
  group_id?: string | null;
}

export default function ClientGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Group | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gr, cl] = await Promise.all([fetch("/api/client-groups"), fetch("/api/clients?limit=500")]);
      if (gr.status === 403) {
        setForbidden(true);
        return;
      }
      const gj = await gr.json();
      if (!gr.ok) {
        toast.error(gj.error ?? "Could not load the groups.");
        return;
      }
      setGroups(Array.isArray(gj.groups) ? gj.groups : []);
      const cj = await cl.json();
      setClients(Array.isArray(cj?.clients) ? cj.clients : []);
    } catch {
      toast.error("Could not load the groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const inAGroup = useMemo(() => new Set(groups.flatMap((g) => g.members.map((m) => m.id))), [groups]);
  const options = useMemo(
    () => clients.filter((c) => !inAGroup.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
    [clients, inAGroup],
  );

  async function createGroup() {
    if (!newName.trim()) {
      toast.error("Give the group a name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/client-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Could not create the group.");
        return;
      }
      toast.success(`Group "${newName.trim()}" created. Add its clients below.`);
      setCreating(false);
      setNewName("");
      setNewDesc("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function change(g: Group, body: Record<string, unknown>, ok: string) {
    const res = await fetch(`/api/client-groups/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Could not save the change.");
      return;
    }
    toast.success(ok);
    load();
  }

  async function removeGroup() {
    if (!toDelete) return;
    const res = await fetch(`/api/client-groups/${toDelete.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error ?? "Could not remove the group.");
      return;
    }
    toast.success(`Group "${toDelete.name}" removed. Its clients are unchanged.`);
    setToDelete(null);
    load();
  }

  if (forbidden) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">You do not have access to client groups.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/clients" aria-label="Back to clients">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client groups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Link related clients, such as a family or a group of companies, so they can be reported together.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-2" /> New group
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-2">
            <Users className="size-10 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No groups yet</p>
            <p className="text-xs text-muted-foreground">Click New group to make the first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{g.name}</CardTitle>
                    {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{g.members.length} clients</Badge>
                    <Button variant="ghost" size="icon" onClick={() => setToDelete(g)} aria-label={`Remove group ${g.name}`}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No clients in this group yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {g.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <Link href={`/dashboard/clients/${m.id}`} className="truncate text-primary hover:underline">
                          {m.name}
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => change(g, { remove_client_ids: [m.id] }, `${m.name} taken out of the group.`)}
                        >
                          <X className="size-4 mr-1" /> Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-1.5">
                  <Label>Add a client to this group</Label>
                  <SearchableSelect
                    options={options}
                    value={pick[g.id] ?? ""}
                    onChange={(v) => {
                      if (!v) return;
                      setPick((p) => ({ ...p, [g.id]: "" }));
                      change(g, { add_client_ids: [v] }, "Client added to the group.");
                    }}
                    placeholder="Clients not yet in a group"
                    searchPlaceholder="Type part of the client name…"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client group</DialogTitle>
            <DialogDescription>Name the group. You can add its clients once it is created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name *</Label>
              <Input id="group-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sarvesh group" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-desc">Note (optional)</Label>
              <Input id="group-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="e.g. Family-owned companies" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createGroup} disabled={saving}>
              {saving ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove group {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              The group is removed. Its {toDelete?.members.length ?? 0} clients are not deleted; they simply no longer belong to a group.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeGroup}>
              Remove group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
