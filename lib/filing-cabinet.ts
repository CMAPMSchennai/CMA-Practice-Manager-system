/**
 * Client filing cabinet (added feature outside the PDF, part A).
 * Every current file filed against the client's jobs, laid out like folders:
 * financial year, then service, then job. A file counts as filed once it has
 * been verified (FR-63). Files not yet verified are returned too, flagged, so
 * the screen can show or hide them. Nothing is copied or moved: this only reads
 * the document records the system already keeps.
 */
import { query } from "@/lib/db";
import { getDocMeta } from "@/lib/document-meta";

export interface CabinetFile {
  id: string;
  name: string;
  version: number;
  size: number | null;
  uploaded_on: string;
  uploaded_by: string | null;
  category: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_on: string | null;
}

export interface CabinetJob {
  id: string;
  code: string;
  status: string;
  period: string | null;
  files: CabinetFile[];
}

export interface Cabinet {
  years: { fy: string; services: { service: string; jobs: CabinetJob[] }[] }[];
  client_papers: CabinetFile[];
  counts: { filed: number; waiting: number };
}

/** Indian financial year label for a date: 2025-06-01 gives "FY 2025-26". */
export function fyLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `FY ${start}-${String(start + 1).slice(2)}`;
}

function periodText(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start} to ${end}` : start;
}

export async function buildCabinet(clientId: string): Promise<Cabinet> {
  const jobDocs = await query<{
    id: string;
    file_name: string;
    version: number;
    file_size_bytes: number | null;
    uploaded_on: string;
    uploaded_by_name: string | null;
    engagement_id: string;
    engagement_code: string;
    eng_status: string;
    period_start: string;
    period_end: string | null;
    service: string | null;
  }>(
    `SELECT d.id, d.file_name, d.version, d.file_size_bytes,
            to_char(d.created_at, 'YYYY-MM-DD') AS uploaded_on,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS uploaded_by_name,
            e.id AS engagement_id, e.engagement_code, e.status AS eng_status,
            to_char(COALESCE(e.period_start, e.created_at::date), 'YYYY-MM-DD') AS period_start,
            to_char(e.period_end, 'YYYY-MM-DD') AS period_end,
            st.name AS service
       FROM documents d
       JOIN engagements e ON d.owner_type = 'engagement' AND e.id = d.owner_id
       LEFT JOIN service_types st ON st.id = e.service_type_id
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE e.client_id = $1::uuid AND d.is_active = true AND e.status <> 'cancelled'
      ORDER BY d.created_at DESC
      LIMIT 1000`,
    [clientId],
  );

  const clientDocs = await query<{
    id: string;
    file_name: string;
    version: number;
    file_size_bytes: number | null;
    uploaded_on: string;
    uploaded_by_name: string | null;
  }>(
    `SELECT d.id, d.file_name, d.version, d.file_size_bytes,
            to_char(d.created_at, 'YYYY-MM-DD') AS uploaded_on,
            COALESCE(NULLIF(trim(u.name), ''), u.email) AS uploaded_by_name
       FROM documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.owner_type = 'client' AND d.owner_id = $1::uuid AND d.is_active = true
      ORDER BY d.created_at DESC
      LIMIT 500`,
    [clientId],
  );

  const meta = await getDocMeta([...jobDocs.map((d) => d.id), ...clientDocs.map((d) => d.id)]);
  const toFile = (d: { id: string; file_name: string; version: number; file_size_bytes: number | null; uploaded_on: string; uploaded_by_name: string | null }): CabinetFile => {
    const m = meta.get(d.id) ?? {};
    return {
      id: d.id,
      name: d.file_name,
      version: d.version,
      size: d.file_size_bytes,
      uploaded_on: d.uploaded_on,
      uploaded_by: d.uploaded_by_name,
      category: m.category ?? null,
      verified: !!m.verified_at,
      verified_by: m.verified_by_name ?? null,
      verified_on: m.verified_at ? String(m.verified_at).slice(0, 10) : null,
    };
  };

  // financial year -> service -> job
  const tree = new Map<string, Map<string, Map<string, CabinetJob & { sort: string }>>>();
  let filed = 0;
  let waiting = 0;
  for (const d of jobDocs) {
    const file = toFile(d);
    if (file.verified) filed++;
    else waiting++;
    const fy = fyLabel(d.period_start);
    const service = d.service ?? "Other";
    const years = tree.get(fy) ?? new Map();
    const services = years.get(service) ?? new Map();
    const job = services.get(d.engagement_id) ?? {
      id: d.engagement_id,
      code: d.engagement_code,
      status: d.eng_status,
      period: periodText(d.period_start, d.period_end),
      files: [] as CabinetFile[],
      sort: d.period_start,
    };
    job.files.push(file);
    services.set(d.engagement_id, job);
    years.set(service, services);
    tree.set(fy, years);
  }

  const years = [...tree.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fy, services]) => ({
      fy,
      services: [...services.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([service, jobs]) => ({
          service,
          jobs: [...jobs.values()]
            .sort((a, b) => b.sort.localeCompare(a.sort))
            .map(({ sort: _sort, ...job }) => job),
        })),
    }));

  const client_papers = clientDocs.map(toFile);
  return { years, client_papers, counts: { filed, waiting } };
}
