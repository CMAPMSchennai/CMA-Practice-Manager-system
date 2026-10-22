"use client";

/**
 * One task library: structure, version history and where it is used (FR-07 to FR-10).
 * Partners edit by making a set of changes, which show straight away on screen
 * and are saved together as the next version, with a note on why.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { applyLibraryOps, type LibArea, type LibOp, type LibStep } from "@/lib/library-ops";

interface Detail {
  library: {
    id: string;
    name: string;
    description: string | null;
    version: number;
    is_variant: boolean;
    base_id: string | null;
    base_name: string | null;
    scope_type: string | null;
    scope_value: string | null;
    own_steps: number;
    total_steps: number;
    used_by: number;
  };
  variants: { id: string; name: string; version: number }[];
  tree: LibArea[];
  inherited?: LibArea[];
  history: { version: number; note: string; by_name: string | null; at: string; changes: string[]; inherited_from?: string | null }[];
  usage: { version: number | null; engagements: number }[];
  can_edit: boolean;
}

type Dlg =
  | { kind: "edit_step"; step: LibStep }
  | { kind: "add_step"; subtaskId: string; subtaskName: string }
  | { kind: "rename_area"; id: string; name: string }
  | { kind: "rename_subtask"; id: string; name: string }
  | { kind: "add_subtask"; areaId: string; areaName: string }
  | { kind: "add_area" }
  | null;

const SCOPE_LABEL: Record<string, string> = { entity_type: "Entity type", client: "Client", dealer: "Dealer brand", oem_brand: "Dealer brand" };

/** Turns web addresses in a step's notes into links (FR-07). */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline text-primary break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function LibraryDetail({ libraryId, onChanged }: { libraryId: string; onChanged: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ops, setOps] = useState<LibOp[]>([]);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const counter = useRef(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/libraries/${libraryId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "The library could not be loaded.");
        return;
      }
      setData(json);
    } catch {
      setError("The library could not be loaded.");
    }
  }, [libraryId]);

  useEffect(() => {
    setData(null);
    setOps([]);
    setEditing(false);
    setNote("");
    load();
  }, [load]);

  const shown = useMemo(() => (data ? applyLibraryOps(data.tree, ops) : { tree: [], changes: [] }), [data, ops]);
  const tempId = () => `new-${Date.now()}-${++counter.current}`;
  const push = (op: LibOp) => setOps((prev) => [...prev, op]);

  async function save() {
    if (!data) return;
    if (!note.trim()) {
      toast.error("Write a short note on why you are changing this library.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/libraries/${libraryId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_version: data.library.version, note, ops }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The changes could not be saved.");
        return;
      }
      toast.success(
        `Saved as version ${json.version}.` +
          (json.variants_bumped ? ` ${json.variants_bumped} brand variants moved to a new version too.` : ""),
      );
      setOps([]);
      setNote("");
      setEditing(false);
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="text-sm text-destructive py-4">{error}</p>;
  if (!data) return <Skeleton className="h-64 w-full" />;
  const lib = data.library;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{lib.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Version {lib.version} · {lib.total_steps} steps
            {lib.scope_type ? ` · ${SCOPE_LABEL[lib.scope_type] ?? lib.scope_type}: ${lib.scope_value}` : ""}
            {lib.used_by > 0 ? ` · used on ${lib.used_by} engagement${lib.used_by === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {data.can_edit && !editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4 mr-2" /> Edit this library
          </Button>
        )}
      </div>

      {lib.is_variant && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          This is a brand variant of <b>{lib.base_name}</b>. Every step of the base template is included automatically when
          an engagement is created. The steps listed below are only this brand's own additions or overrides
          {lib.own_steps === 0 ? " (there are none yet)" : ""}. To change a common step, edit the base template.
        </div>
      )}
      {data.variants.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          This is the base template for {data.variants.map((v) => v.name).join(", ")}. Changes saved here flow into all of
          them, and each moves to a new version.
        </div>
      )}

      {editing && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2 sticky top-2 z-10">
          <p className="text-sm font-medium">
            Editing. {ops.length === 0 ? "No changes yet." : `${shown.changes.length} change${shown.changes.length === 1 ? "" : "s"} waiting to be saved as version ${lib.version + 1}.`}
          </p>
          {shown.changes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 max-h-24 overflow-y-auto">
              {shown.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          <Textarea
            rows={2}
            placeholder="Why are you making these changes? (required)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOps([]);
                setNote("");
                setEditing(false);
              }}
            >
              {ops.length === 0 ? "Close" : "Discard changes"}
            </Button>
            <Button size="sm" disabled={saving || ops.length === 0 || !note.trim()} onClick={save}>
              {saving ? "Saving…" : `Save as version ${lib.version + 1}`}
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure">Steps</TabsTrigger>
          <TabsTrigger value="history">Version history</TabsTrigger>
          <TabsTrigger value="usage">In use</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="mt-4 space-y-3">
          {shown.tree.length === 0 && !lib.is_variant && (
            <p className="text-sm text-muted-foreground py-6 text-center">This library has no steps yet.</p>
          )}
          {lib.is_variant && shown.tree.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No steps of its own yet: this brand uses the base template as it is. Its {lib.total_steps - lib.own_steps} inherited
              steps are listed below for reading.
            </p>
          )}
          {shown.tree.map((area) => (
            <Card key={area.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {area.name}
                    {area.is_new && <Badge className="ml-2 text-xs">New</Badge>}
                  </p>
                  {editing && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: "rename_area", id: area.id, name: area.name })}>
                        <Pencil className="size-3.5 mr-1" /> Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: "add_subtask", areaId: area.id, areaName: area.name })}>
                        <Plus className="size-3.5 mr-1" /> Sub-task
                      </Button>
                    </div>
                  )}
                </div>
                {area.subtasks.map((st) => (
                  <div key={st.id} className="rounded-md border">
                    <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                      <p className="text-sm font-medium">
                        {st.name}
                        {st.is_new && <Badge className="ml-2 text-xs">New</Badge>}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{st.steps.length} steps</span>
                      </p>
                      {editing && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: "rename_subtask", id: st.id, name: st.name })}>
                            <Pencil className="size-3.5 mr-1" /> Rename
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: "add_step", subtaskId: st.id, subtaskName: st.name })}>
                            <Plus className="size-3.5 mr-1" /> Step
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="divide-y">
                      {st.steps.map((s, idx) => (
                        <li key={s.id} className="px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p>
                                <span className="font-mono text-xs text-muted-foreground mr-2">{s.step_code}</span>
                                {s.name}
                                {s.is_new && <Badge className="ml-2 text-xs">New</Badge>}
                              </p>
                              {s.description && (
                                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                  <Linked text={s.description} />
                                </p>
                              )}
                              {(s.estimated_hours != null || s.default_assignee_role) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {s.estimated_hours != null ? `${s.estimated_hours} h` : ""}
                                  {s.estimated_hours != null && s.default_assignee_role ? " · " : ""}
                                  {s.default_assignee_role ?? ""}
                                </p>
                              )}
                            </div>
                            {editing && (
                              <div className="flex shrink-0 gap-0.5">
                                <Button size="icon" variant="ghost" className="size-7" disabled={idx === 0} onClick={() => push({ op: "move_step", id: s.id, direction: "up" })}>
                                  <ArrowUp className="size-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="size-7" disabled={idx === st.steps.length - 1} onClick={() => push({ op: "move_step", id: s.id, direction: "down" })}>
                                  <ArrowDown className="size-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="size-7" onClick={() => setDlg({ kind: "edit_step", step: s })}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => push({ op: "remove_step", id: s.id })}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                      {st.steps.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No steps.</li>}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          {editing && (
            <Button variant="outline" size="sm" onClick={() => setDlg({ kind: "add_area" })}>
              <Plus className="size-4 mr-2" /> Add an area
            </Button>
          )}

          {lib.is_variant && (data.inherited?.length ?? 0) > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">
                Inherited from {lib.base_name}{" "}
                <span className="font-normal text-muted-foreground">(read only; edit the base template to change these)</span>
              </p>
              {data.inherited!.map((area) => (
                <details key={area.id} className="rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium bg-muted/40">
                    {area.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {area.subtasks.reduce((n, st) => n + st.steps.length, 0)} steps
                    </span>
                  </summary>
                  <div className="p-3 space-y-3">
                    {area.subtasks.map((st) => (
                      <div key={st.id}>
                        <p className="text-sm font-medium">{st.name}</p>
                        <ul className="mt-1 divide-y rounded-md border">
                          {st.steps.map((s) => (
                            <li key={s.id} className="px-3 py-1.5 text-sm">
                              <span className="font-mono text-xs text-muted-foreground mr-2">{s.step_code}</span>
                              {s.name}
                              {s.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                                  <Linked text={s.description} />
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {data.history.map((h) => (
            <Card key={h.version}>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-medium">
                  Version {h.version}
                  {h.version === lib.version && <Badge className="ml-2 text-xs">Current</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(h.at)}
                  {h.by_name ? ` · ${h.by_name}` : ""}
                </p>
                <p className="text-sm">{h.note}</p>
                {h.changes.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-5">
                    {h.changes.slice(0, 30).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                    {h.changes.length > 30 && <li>…and {h.changes.length - 30} more.</li>}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium">Version 1</p>
              <p className="text-sm text-muted-foreground">The library as first loaded from the firm's workbook.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          {data.usage.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No engagement has been created from this library yet.</p>
          ) : (
            <div className="border rounded-md overflow-hidden max-w-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="px-3 py-2 font-medium">Created from version</th>
                    <th className="px-3 py-2 font-medium text-right">Engagements</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.map((u, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{u.version != null ? `Version ${u.version}` : "Not recorded"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.engagements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3 max-w-prose">
            Tasks already on an engagement keep their own copy of each step, so a new version never changes work that has
            been started.
          </p>
        </TabsContent>
      </Tabs>

      <EditDialog
        dlg={dlg}
        onClose={() => setDlg(null)}
        onApply={(op) => {
          push(op);
          setDlg(null);
        }}
        tempId={tempId}
      />
    </div>
  );
}

function EditDialog({
  dlg,
  onClose,
  onApply,
  tempId,
}: {
  dlg: Dlg;
  onClose: () => void;
  onApply: (op: LibOp) => void;
  tempId: () => string;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [hours, setHours] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    if (!dlg) return;
    if (dlg.kind === "edit_step") {
      setName(dlg.step.name);
      setNotes(dlg.step.description ?? "");
      setHours(dlg.step.estimated_hours != null ? String(dlg.step.estimated_hours) : "");
      setRole(dlg.step.default_assignee_role ?? "");
    } else if (dlg.kind === "rename_area" || dlg.kind === "rename_subtask") {
      setName(dlg.name);
    } else {
      setName("");
      setNotes("");
    }
  }, [dlg]);

  if (!dlg) return null;
  const withNotes = dlg.kind === "edit_step" || dlg.kind === "add_step";

  const title =
    dlg.kind === "edit_step" ? "Edit step"
    : dlg.kind === "add_step" ? `Add a step to "${dlg.subtaskName}"`
    : dlg.kind === "rename_area" ? "Rename area"
    : dlg.kind === "rename_subtask" ? "Rename sub-task"
    : dlg.kind === "add_subtask" ? `Add a sub-task to "${dlg.areaName}"`
    : "Add an area";

  function apply() {
    const n = name.trim();
    if (!n || !dlg) return;
    if (dlg.kind === "edit_step") {
      const h = hours.trim() === "" ? null : Number(hours);
      onApply({
        op: "update_step",
        id: dlg.step.id,
        name: n,
        description: notes.trim() === "" ? null : notes,
        estimated_hours: h !== null && Number.isFinite(h) && h >= 0 ? h : null,
        default_assignee_role: role.trim() === "" ? null : role.trim(),
      });
    } else if (dlg.kind === "add_step") {
      onApply({ op: "add_step", subtask_id: dlg.subtaskId, temp_id: tempId(), name: n, description: notes.trim() === "" ? null : notes });
    } else if (dlg.kind === "rename_area") onApply({ op: "rename_area", id: dlg.id, name: n });
    else if (dlg.kind === "rename_subtask") onApply({ op: "rename_subtask", id: dlg.id, name: n });
    else if (dlg.kind === "add_subtask") onApply({ op: "add_subtask", area_id: dlg.areaId, temp_id: tempId(), name: n });
    else onApply({ op: "add_area", temp_id: tempId(), name: n });
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>The change is saved with the others as the next version.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {withNotes && (
            <>
              <div className="space-y-1.5">
                <Label>Reference / notes</Label>
                <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Long text is fine. Web addresses become links." />
              </div>
              {dlg.kind === "edit_step" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Estimated hours</Label>
                    <Input type="number" min="0" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default role</Label>
                    <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. articled_clerk" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={apply}>Add to changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
