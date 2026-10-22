"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import Link from "next/link";
import { Download, FileText, Folder, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import type { Cabinet, CabinetFile } from "@/lib/filing-cabinet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function sizeText(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function dateText(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function Folder_({ title, sub, count, defaultOpen, children, level }: { title: string; sub?: string; count?: number; defaultOpen?: boolean; children: React.ReactNode; level: number }) {
  return (
    <details open={defaultOpen} className="group" style={{ marginLeft: level * 16 }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Folder className="size-4 shrink-0 text-muted-foreground group-open:hidden" aria-hidden="true" />
        <FolderOpen className="hidden size-4 shrink-0 text-primary group-open:block" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{title}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {count !== undefined && <span className="ml-auto text-xs text-muted-foreground">{count} {count === 1 ? "file" : "files"}</span>}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function FileRow({ f, level }: { f: CabinetFile; level: number }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${f.id}/download`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "The file couldn't be opened.");
        return;
      }
      if (json.download_url) window.open(json.download_url, "_blank");
      else toast.error("File storage isn't connected yet, so the file can't be opened. The record is saved.");
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-2 py-2" style={{ marginLeft: level * 16 }}>
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{f.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[f.category, `Version ${f.version}`, sizeText(f.size), f.uploaded_by ? `Uploaded by ${f.uploaded_by}` : null, dateText(f.uploaded_on)].filter(Boolean).join(" · ")}
        </p>
      </div>
      {f.verified ? (
        <StatusChip tone="ok">Verified{f.verified_by ? ` by ${f.verified_by}` : ""}{f.verified_on ? `, ${dateText(f.verified_on)}` : ""}</StatusChip>
      ) : (
        <StatusChip tone="warn">Waiting to be verified</StatusChip>
      )}
      <Button variant="outline" size="sm" onClick={open} disabled={busy}>
        <Download className="mr-1.5 size-3.5" aria-hidden="true" />
        Open
      </Button>
    </div>
  );
}

/** Everything filed for the client, laid out like folders: year, service, job. */
export function FilingCabinet({ clientId }: { clientId: string }) {
  const { data, isLoading } = useSWR<Cabinet | { error: string }>(`/api/clients/${clientId}/filing-cabinet`, fetcher);
  const [showAll, setShowAll] = useState(false);
  const cab = data && !("error" in data) ? data : null;

  if (isLoading && !cab) return <Skeleton className="h-40 w-full" />;
  if (!cab) return null;

  const keep = (f: CabinetFile) => showAll || f.verified;
  const years = cab.years
    .map((y) => ({
      ...y,
      services: y.services
        .map((s) => ({ ...s, jobs: s.jobs.map((j) => ({ ...j, files: j.files.filter(keep) })).filter((j) => j.files.length > 0) }))
        .filter((s) => s.jobs.length > 0),
    }))
    .filter((y) => y.services.length > 0);
  const papers = cab.client_papers.filter(keep);
  const empty = years.length === 0 && papers.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">Filing cabinet</CardTitle>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4" />
            Include files not yet verified
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {cab.counts.filed} {cab.counts.filed === 1 ? "file" : "files"} filed
          {cab.counts.waiting > 0 ? `, ${cab.counts.waiting} waiting to be verified` : ""}. A file is filed once it has been verified on its job.
        </p>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing is filed yet. A file appears here once it has been verified on its job.
          </p>
        ) : (
          <div className="space-y-1">
            {papers.length > 0 && (
              <Folder_ title="Client papers" sub="KYC, letters and other papers about the client" count={papers.length} level={0}>
                {papers.map((f) => (
                  <FileRow key={f.id} f={f} level={1} />
                ))}
              </Folder_>
            )}
            {years.map((y, yi) => (
              <Folder_ key={y.fy} title={y.fy} defaultOpen={yi === 0} level={0}>
                {y.services.map((s) => (
                  <Folder_ key={s.service} title={s.service} defaultOpen={yi === 0} level={1}>
                    {s.jobs.map((j) => (
                      <Folder_
                        key={j.id}
                        title={j.code}
                        sub={j.period ?? undefined}
                        count={j.files.length}
                        defaultOpen={yi === 0}
                        level={2}
                      >
                        <div className="mb-1" style={{ marginLeft: 3 * 16 }}>
                          <Link href={`/dashboard/engagements/${j.id}`} className="text-xs text-primary underline">
                            Open this job
                          </Link>
                        </div>
                        {j.files.map((f) => (
                          <FileRow key={f.id} f={f} level={3} />
                        ))}
                      </Folder_>
                    ))}
                  </Folder_>
                ))}
              </Folder_>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
