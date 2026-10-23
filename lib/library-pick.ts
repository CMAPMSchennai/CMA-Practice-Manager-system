/**
 * Which task library a new job gets (FR-08: "library selected by scope: entity type / client / OEM brand").
 *
 *   Statutory audit      -> by the client's entity type: Private Limited = PVT, Public Limited = LST
 *   Internal audit       -> the library written for that client (Mahamaya, N. Gopaldas, Siddhartha)
 *   OEM operational audit -> the dealer's brand library (Hyundai, Mahindra, Nissan), else the base template
 *
 * Anything else, or a client with no match, returns null: the person then picks a library on the
 * job page, as before. The match for internal audit and OEM uses the client's name.
 */
import { query } from "@/lib/db";
import { normName } from "@/lib/job-type";

type Family = "statutory" | "internal" | "oem";

export function familyFor(serviceName: string): Family | null {
  const n = normName(serviceName);
  if (n.startsWith("statutory audit")) return "statutory";
  if (n.startsWith("internal audit")) return "internal";
  if (n.includes("operational audit")) return "oem";
  return null;
}

const CLIENT_WORDS: Record<string, string[]> = {
  "IA-MAH": ["mahamaya"],
  GOP: ["gopaldas"],
  SID: ["siddhartha"],
};
const BRAND_WORDS: Record<string, string[]> = {
  HYU: ["hyundai"],
  "OA-MAH": ["mahindra"],
  NIS: ["nissan"],
};

export async function pickLibraryFor(
  serviceName: string,
  clientId: string,
): Promise<{ id: string; name: string } | null> {
  const family = familyFor(serviceName);
  if (!family) return null;

  const clients = await query<{ name: string; entity_type: string | null }>(
    `SELECT c.name, r.label AS entity_type
       FROM clients c LEFT JOIN reference_data r ON r.id = c.entity_type_id
      WHERE c.id = $1::uuid LIMIT 1`,
    [clientId],
  );
  const client = clients[0];
  if (!client) return null;
  const clientName = client.name.toLowerCase();

  const libs = await query<{ id: string; name: string; stype: string | null; sval: string | null }>(
    `SELECT l.id, l.name, m.metadata -> 'scope' ->> 'type' AS stype, m.metadata -> 'scope' ->> 'value' AS sval
       FROM task_libraries l
       JOIN reference_data m ON m.type = 'task_library_meta' AND m.metadata ->> 'library_id' = l.id::text
      WHERE l.is_active = true`,
  );

  if (family === "statutory") {
    const t = (client.entity_type ?? "").toLowerCase();
    const want = t === "private limited" ? "PVT" : t === "public limited" ? "LST" : null;
    const hit = want ? libs.find((l) => l.stype === "entity_type" && l.sval === want) : undefined;
    return hit ? { id: hit.id, name: hit.name } : null;
  }

  if (family === "internal") {
    const hit = libs.find(
      (l) => l.stype === "client" && (CLIENT_WORDS[l.sval ?? ""] ?? []).some((w) => clientName.includes(w)),
    );
    return hit ? { id: hit.id, name: hit.name } : null;
  }

  const brand = libs.find(
    (l) => l.stype === "oem_brand" && (BRAND_WORDS[l.sval ?? ""] ?? []).some((w) => clientName.includes(w)),
  );
  const chosen = brand ?? libs.find((l) => l.stype === "oem_brand" && l.sval === "BASE");
  return chosen ? { id: chosen.id, name: chosen.name } : null;
}
