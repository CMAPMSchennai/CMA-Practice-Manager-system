/**
 * Real file storage in Dropbox (added feature C1).
 *
 * The platform's Dropbox connector only sends small JSON requests, so file
 * contents go straight to Dropbox's content address using the access token the
 * platform puts in this app's environment. Dropbox makes any missing folders on
 * the way, so uploading is one call.
 *
 * Folder layout (default, to be confirmed with the firm):
 *   /CMA-PMS/<Client> (<code>)/<Financial year>/<Service>/<Job code>/<file>   job files
 *   /CMA-PMS/<Client> (<code>)/Client papers/<file>                            client papers
 *   /CMA-PMS/Staff/<Name> (<code>)/<file>                                      staff papers
 *   /CMA-PMS/Firm/<Entity>/<file>                                              firm papers
 */
import { query } from "@/lib/db";
import { fyLabel } from "@/lib/filing-cabinet";

export const DROPBOX_ROOT = "CMA-PMS";
/** The app's request layer holds an upload in memory, so keep it modest. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** One folder or file name that Dropbox accepts. */
export function safeName(s: string): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 100);
  return cleaned || "Unnamed";
}

/** The Dropbox folder a document belongs in, or null if the owner does not exist. */
export async function dropboxFolderFor(ownerType: string, ownerId: string): Promise<string | null> {
  const root = `/${DROPBOX_ROOT}`;
  if (ownerType === "engagement") {
    const r = await query<{
      engagement_code: string;
      period_start: string;
      service: string | null;
      client_name: string;
      client_code: string | null;
    }>(
      `SELECT e.engagement_code,
              to_char(COALESCE(e.period_start, e.created_at::date), 'YYYY-MM-DD') AS period_start,
              st.name AS service, c.name AS client_name, c.client_code
         FROM engagements e
         JOIN clients c ON c.id = e.client_id
         LEFT JOIN service_types st ON st.id = e.service_type_id
        WHERE e.id = $1::uuid`,
      [ownerId],
    );
    const e = r[0];
    if (!e) return null;
    const client = safeName(e.client_code ? `${e.client_name} (${e.client_code})` : e.client_name);
    return `${root}/${client}/${safeName(fyLabel(e.period_start))}/${safeName(e.service ?? "Other")}/${safeName(e.engagement_code)}`;
  }
  if (ownerType === "client") {
    const r = await query<{ name: string; client_code: string | null }>(
      `SELECT name, client_code FROM clients WHERE id = $1::uuid`,
      [ownerId],
    );
    const c = r[0];
    if (!c) return null;
    return `${root}/${safeName(c.client_code ? `${c.name} (${c.client_code})` : c.name)}/Client papers`;
  }
  if (ownerType === "employee") {
    const r = await query<{ first_name: string; last_name: string | null; employee_id_code: string | null }>(
      `SELECT first_name, last_name, employee_id_code FROM employees WHERE id = $1::uuid`,
      [ownerId],
    );
    const e = r[0];
    if (!e) return null;
    const full = `${e.first_name} ${e.last_name ?? ""}`.trim();
    return `${root}/Staff/${safeName(e.employee_id_code ? `${full} (${e.employee_id_code})` : full)}`;
  }
  if (ownerType === "entity") {
    const r = await query<{ name: string }>(`SELECT name FROM entities WHERE id = $1::uuid`, [ownerId]);
    return r[0] ? `${root}/Firm/${safeName(r[0].name)}` : null;
  }
  return null;
}

/** Dropbox wants this header as plain ASCII; escape everything else. */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
}

export function dropboxToken(): string | null {
  return process.env.DROPBOX_ACCESS_TOKEN || process.env.DROPBOX_TOKEN || null;
}

/** Put a file in Dropbox. A file with the same path is replaced (Dropbox keeps its own history). */
export async function uploadToDropbox(
  folder: string,
  fileName: string,
  bytes: ArrayBuffer,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const token = dropboxToken();
  if (!token) return { ok: false, error: "Dropbox is not connected for this app." };
  const path = `${folder}/${safeName(fileName)}`;
  try {
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": asciiJson({ path, mode: "overwrite", autorename: false, mute: true }),
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    const text = await res.text();
    if (!res.ok) {
      let summary = text.slice(0, 300);
      try {
        const j = JSON.parse(text) as { error_summary?: string };
        if (j.error_summary) summary = j.error_summary;
      } catch {
        // keep the raw text
      }
      if (res.status === 401) summary = `Dropbox refused the connection (${summary}). Reconnect Dropbox and restart the app.`;
      if (/insufficient_space/.test(summary)) summary = "The Dropbox account is full.";
      return { ok: false, error: summary };
    }
    let shown = path;
    try {
      const j = JSON.parse(text) as { path_display?: string };
      if (j.path_display) shown = j.path_display;
    } catch {
      // keep our own path
    }
    return { ok: true, path: shown };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Dropbox." };
  }
}
