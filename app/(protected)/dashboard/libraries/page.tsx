"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LibraryDetail } from "@/components/libraries/LibraryDetail";

interface Library {
  id: string;
  name: string;
  version: number;
  is_variant: boolean;
  base_name: string | null;
  scope_type: string | null;
  scope_value: string | null;
  total_steps: number;
  used_by: number;
  variants: number;
}

const SCOPE_LABEL: Record<string, string> = { entity_type: "Entity type", client: "Client", dealer: "Dealer brand", oem_brand: "Dealer brand" };

export default function LibrariesPage() {
  const [libraries, setLibraries] = useState<Library[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/libraries");
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "The libraries could not be loaded.");
        setLibraries([]);
        return;
      }
      setLibraries(Array.isArray(json.libraries) ? json.libraries : []);
    } catch {
      toast.error("The libraries could not be loaded.");
      setLibraries([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          Task libraries
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-prose">
          The procedures that engagements are built from: area, sub-task, then step. Partners can edit a library; every
          saved change becomes a new version, so each engagement records which version it was created from.
        </p>
      </div>

      <div className="border rounded-md overflow-x-auto bg-card">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Library</th>
              <th className="px-3 py-2 font-medium">Chosen by</th>
              <th className="px-3 py-2 font-medium text-right">Steps</th>
              <th className="px-3 py-2 font-medium text-right">Version</th>
              <th className="px-3 py-2 font-medium text-right">Engagements</th>
            </tr>
          </thead>
          <tbody>
            {libraries === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
            {libraries?.map((l) => (
              <tr
                key={l.id}
                className={`border-t cursor-pointer hover:bg-muted/30 ${selected === l.id ? "bg-muted/50" : ""}`}
                onClick={() => setSelected(l.id)}
              >
                <td className="px-3 py-2">
                  <p className="font-medium">{l.name}</p>
                  {l.is_variant && <p className="text-xs text-muted-foreground">Brand variant of {l.base_name}</p>}
                  {l.variants > 0 && <p className="text-xs text-muted-foreground">Base template for {l.variants} brands</p>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {l.scope_type ? `${SCOPE_LABEL[l.scope_type] ?? l.scope_type}: ${l.scope_value}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.total_steps}</td>
                <td className="px-3 py-2 text-right"><Badge variant="secondary">v{l.version}</Badge></td>
                <td className="px-3 py-2 text-right tabular-nums">{l.used_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <LibraryDetail libraryId={selected} onChanged={load} />
      ) : (
        libraries && libraries.length > 0 && (
          <p className="text-sm text-muted-foreground">Choose a library above to see its steps and version history.</p>
        )
      )}
    </div>
  );
}
