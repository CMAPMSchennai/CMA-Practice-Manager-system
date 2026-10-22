"use client";

import { FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ExtraDetails {
  fields?: Record<string, string>;
  name_as_imported?: string | null;
  profile_incomplete?: boolean;
  to_collect?: string[];
  import_notes?: string[];
}

/**
 * Details from the firm's workbook that don't have their own field yet
 * (Gaps #38, #40), plus import flags (§11.3). Renders nothing when empty.
 */
export function ImportedDetailsCard({ extras }: { extras: ExtraDetails | null | undefined }) {
  if (!extras) return null;
  const fields = Object.entries(extras.fields ?? {});
  const toCollect = extras.to_collect ?? [];
  const notes = extras.import_notes ?? [];
  if (!fields.length && !toCollect.length && !notes.length && !extras.name_as_imported && !extras.profile_incomplete) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="size-4" />
          Imported details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(extras.profile_incomplete || toCollect.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {extras.profile_incomplete && <Badge variant="outline">Profile incomplete</Badge>}
            {toCollect.length > 0 && <Badge variant="outline">To collect: {toCollect.join(", ")}</Badge>}
          </div>
        )}
        {extras.name_as_imported && (
          <p className="text-sm text-muted-foreground">
            Name as imported: <span className="text-foreground">{extras.name_as_imported}</span>
          </p>
        )}
        {fields.length > 0 && (
          <dl className="divide-y divide-border">
            {fields.map(([label, value]) => (
              <div key={label} className="grid grid-cols-2 gap-4 py-2">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm text-foreground font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {notes.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
