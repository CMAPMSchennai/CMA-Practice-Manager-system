/**
 * Server side of the editable document type list (see lib/document-categories.ts).
 * Rows live in reference_data with type "document_type": label = the type's name,
 * metadata.category = one of the seven PDF categories.
 */
import { query } from "@/lib/db";
import { DEFAULT_DOCUMENT_TYPES, isCategory, type DocumentCategory } from "@/lib/document-categories";

export interface DocumentTypeRow {
  id: string;
  label: string;
  category: DocumentCategory;
  is_active: boolean;
  sort_order: number;
}

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** The first time the list is read, fill it with the types the upload box has always offered. */
async function seedIfEmpty(): Promise<void> {
  const n = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM reference_data WHERE type = 'document_type'`);
  if (parseInt(n[0]?.n ?? "0", 10) > 0) return;
  let order = 0;
  for (const t of DEFAULT_DOCUMENT_TYPES) {
    order += 10;
    await query(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ('document_type', $1, $2, $3, true, $4)`,
      [slug(t.label), t.label, order, JSON.stringify({ category: t.category })],
    );
  }
}

export async function listDocumentTypes(): Promise<DocumentTypeRow[]> {
  await seedIfEmpty();
  const rows = await query<{ id: string; label: string; sort_order: number; is_active: boolean; metadata: unknown }>(
    `SELECT id, label, sort_order, is_active, metadata
       FROM reference_data WHERE type = 'document_type' ORDER BY sort_order ASC, label ASC`,
  );
  return rows.map((r) => {
    const meta = (typeof r.metadata === "string" ? safeJson(r.metadata) : r.metadata) as { category?: unknown } | null;
    return {
      id: r.id,
      label: r.label,
      category: isCategory(meta?.category) ? meta.category : "Other",
      is_active: r.is_active,
      sort_order: r.sort_order,
    };
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Type name (lower case) to category, for labelling documents. Unknown types fall under "Other". */
export async function categoryMap(): Promise<Map<string, DocumentCategory>> {
  const rows = await listDocumentTypes();
  return new Map(rows.map((r) => [r.label.toLowerCase(), r.category]));
}

export function categoryOf(map: Map<string, DocumentCategory>, type: unknown): DocumentCategory {
  if (typeof type !== "string" || !type.trim()) return "Other";
  return map.get(type.trim().toLowerCase()) ?? "Other";
}

export { slug as documentTypeSlug };
