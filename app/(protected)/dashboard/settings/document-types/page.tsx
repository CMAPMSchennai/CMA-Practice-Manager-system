"use client";

/**
 * Settings > Document types. The Managing Partner or Admin sets which of the PDF's seven
 * categories each document type belongs to, switches types on or off, and adds new ones.
 * A type's name can't be changed: files already uploaded remember it. Add a new type instead.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DOCUMENT_CATEGORIES } from "@/lib/document-categories";

interface TypeRow {
  id: string;
  label: string;
  category: string;
  is_active: boolean;
}

export default function DocumentTypesPage() {
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<string>("Other");
  const [adding, setAdding] = useState(false);

  function load() {
    fetch("/api/document-types")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d?.document_types) ? d.document_types : []);
        setCanEdit(!!d?.can_edit);
      })
      .catch(() => toast.error("The document types couldn't be loaded."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function change(id: string, patch: { category?: string; is_active?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch("/api/document-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The change wasn't saved.");
        return;
      }
      toast.success("Saved.");
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function add() {
    if (!newName.trim()) {
      toast.error("Type a name for the new document type.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/document-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newName.trim(), category: newCat }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "The type wasn't added.");
        return;
      }
      toast.success("Document type added.");
      setNewName("");
      load();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Document types</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff choose a document type when they upload. The category is filled in from this list, so documents can be
          filtered by KYC, Banking, Statutory and so on.
        </p>
      </div>

      {canEdit && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add a document type</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem] space-y-1.5">
              <label htmlFor="dt-name" className="text-xs text-muted-foreground">Name</label>
              <Input id="dt-name" placeholder="e.g. FEMA Certificate" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dt-cat" className="text-xs text-muted-foreground">Category</label>
              <select
                id="dt-cat"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button onClick={add} disabled={adding}>
              <Plus className="size-4 mr-1" /> Add
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Document type</th>
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">In use</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className={r.is_active ? "" : "opacity-60"}>
                      <td className="px-4 py-2 text-foreground">{r.label}</td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <select
                            aria-label={`Category for ${r.label}`}
                            value={r.category}
                            disabled={busyId === r.id}
                            onChange={(e) => change(r.id, { category: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                          >
                            {DOCUMENT_CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          r.category
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.id}
                            onClick={() => change(r.id, { is_active: !r.is_active })}
                          >
                            {r.is_active ? "Switch off" : "Switch on"}
                          </Button>
                        ) : (
                          <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "On" : "Off"}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        A type that is switched off no longer appears in the upload box. Files already uploaded keep it.
      </p>
    </div>
  );
}
