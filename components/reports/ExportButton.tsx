"use client";

/**
 * "Export to Excel" for a list screen (FR-80). It downloads the matching
 * standard report, so what you export follows the same access rules as the
 * Reports page, and tells you plainly if your role can't export.
 */
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({
  report,
  params,
  label = "Excel",
}: {
  report: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const p = new URLSearchParams({ report, from: "2000-01-01", to: new Date().toISOString().slice(0, 10) });
      for (const [k, v] of Object.entries(params ?? {})) if (v) p.set(k, v);
      const res = await fetch(`/api/reports/export?${p}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(
          res.status === 403
            ? "Your role can't export this list. Ask a Partner or the Managing Partner."
            : json.error ?? "The export did not work.",
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("The export did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      <FileSpreadsheet className="size-4 mr-2" />
      {busy ? "Preparing…" : label}
    </Button>
  );
}
