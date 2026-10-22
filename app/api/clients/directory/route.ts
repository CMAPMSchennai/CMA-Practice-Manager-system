/**
 * GET /api/clients/directory?tab=&q=&status=  (FR-25, FR-26, FR-27)
 *
 * The client directory: one row per client with type, PAN (last 4 only), area,
 * services, partner in charge and onboarding stage, plus the summary tiles.
 * Tiles always cover every client the user can see; the tab, search and stage
 * filters only narrow the rows. "KYC verified" means the checklist item
 * "KYC/ID proof of signatories" is complete (Gap #61, default for confirmation).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { clientVisibleSql, getAccessScope } from "@/lib/access-scope";
import { decryptField } from "@/lib/field-crypto";
import { areaOfAddress, tabOfEntityType, type DirectoryTab } from "@/lib/client-directory";

interface Row {
  id: string;
  client_code: string;
  name: string;
  trade_name: string | null;
  pan: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  partner_in_charge_id: string | null;
  partner_name: string | null;
  onboarding_status: string;
  is_active: boolean;
  created_at: string;
  entity_type_code: string | null;
  entity_type_label: string | null;
  services: string[] | null;
  kyc_verified: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!(await userHasPermission(session.id, "view_clients"))) {
      return NextResponse.json({ error: "You do not have permission to view clients" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const tab = (sp.get("tab") ?? "all") as DirectoryTab;
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const status = sp.get("status") ?? "all";

    const scope = await getAccessScope(session.id);
    const values: unknown[] = [];
    let visible = "TRUE";
    if (scope.mode !== "all") {
      values.push(session.id);
      visible = clientVisibleSql(scope, "c.id", 1);
    }

    const rows = await query<Row>(
      `SELECT c.id, c.client_code, c.name, c.trade_name, c.pan, c.gstin, c.address, c.city,
              c.partner_in_charge_id, c.onboarding_status, c.is_active, c.created_at,
              rd.code AS entity_type_code, rd.label AS entity_type_label,
              COALESCE(NULLIF(trim(u.name), ''), u.email) AS partner_name,
              COALESCE((SELECT array_agg(st.name ORDER BY st.name)
                          FROM client_service_scope s JOIN service_types st ON st.id = s.service_type_id
                         WHERE s.client_id = c.id), '{}') AS services,
              EXISTS (SELECT 1 FROM onboarding_checklist_items o
                       WHERE o.owner_type = 'client' AND o.owner_id = c.id
                         AND o.checklist_item_code = 'kyc_signatories' AND o.is_complete) AS kyc_verified
         FROM clients c
         LEFT JOIN reference_data rd ON rd.id = c.entity_type_id
         LEFT JOIN users u ON u.id = c.partner_in_charge_id
        WHERE c.is_active = true AND ${visible}
        ORDER BY c.name`,
      values,
    );

    const all = rows.map((r) => {
      let pan: string | null = null;
      try {
        pan = decryptField(r.pan);
      } catch {
        pan = null;
      }
      return {
        id: r.id,
        client_code: r.client_code,
        name: r.name,
        trade_name: r.trade_name,
        entity_type_code: r.entity_type_code,
        entity_type_label: r.entity_type_label,
        group: tabOfEntityType(r.entity_type_code),
        pan_last4: pan ? pan.slice(-4) : null,
        _pan: pan,
        gstin: r.gstin,
        // The city on the record (from the workbook or the client form) wins; the address guess is the fallback.
        area: r.city?.trim() || areaOfAddress(r.address),
        _address: `${r.address ?? ""} ${r.city ?? ""}`.trim(),
        services: r.services ?? [],
        partner_in_charge_id: r.partner_in_charge_id,
        partner_name: r.partner_name,
        onboarding_status: r.onboarding_status,
        kyc_verified: r.kyc_verified,
        created_at: r.created_at,
      };
    });

    const summary = {
      total: all.length,
      companies: all.filter((c) => c.group === "companies").length,
      individuals: all.filter((c) => c.group === "individuals").length,
      trust_llp: all.filter((c) => c.group === "trust_llp").length,
      other: all.filter((c) => c.group === "other").length,
      onboarding_pending: all.filter((c) => c.onboarding_status !== "activated").length,
      kyc_verified: all.filter((c) => c.kyc_verified).length,
      activated: all.filter((c) => c.onboarding_status === "activated").length,
    };

    const filtered = all.filter((c) => {
      if (tab !== "all" && c.group !== tab) return false;
      if (status !== "all" && c.onboarding_status !== status) return false;
      if (!q) return true;
      const pan = (c._pan ?? "").toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.trade_name ?? "").toLowerCase().includes(q) ||
        c.client_code.toLowerCase().includes(q) ||
        (c.gstin ?? "").toLowerCase().includes(q) ||
        c._address.toLowerCase().includes(q) ||
        (q.length >= 4 && pan.includes(q))
      );
    });

    const clients = filtered.map((c) => {
      const { _pan, _address, ...rest } = c;
      void _pan;
      void _address;
      return rest;
    });

    return NextResponse.json({
      clients,
      summary,
      shown: clients.length,
      can_edit: await userHasPermission(session.id, "edit_clients"),
      can_create: await userHasPermission(session.id, "create_clients"),
    });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
