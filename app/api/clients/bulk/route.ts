/**
 * GET  /api/clients/bulk   the choices for the bulk dialogs: partners, services, entities
 * POST /api/clients/bulk   { ids, action, ... }  (FR-30, FR-37)
 *
 *   assign_partner    { partner_id }           set the partner in charge
 *   set_scope         { service_type_ids, create_engagements?, billing_entity_id? }
 *                     adds services to the clients' scope; optionally creates a draft
 *                     engagement for the current period for each client and service
 *   mark_kyc          ticks "KYC/ID proof of signatories" on each client's checklist
 *   start_onboarding  moves Imported clients into the KYC & Docs stage
 *
 * Needs edit_clients. Clients outside the user's scope are left alone.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query, pool } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";
import { nextEngagementCode } from "@/lib/engagement-code";
import { currentPeriod } from "@/lib/engagement-period";

const MAX_IDS = 500;
const MAX_ENGAGEMENTS = 500;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await userHasPermission(session.id, "edit_clients"))) {
      return NextResponse.json({ error: "You do not have permission to edit clients" }, { status: 403 });
    }
    const [partners, services, entities] = await Promise.all([
      query<{ id: string; name: string }>(
        `SELECT u.id, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.name IN ('managing_partner', 'partner')
          ORDER BY name`,
      ),
      query<{ id: string; name: string; code: string }>(
        `SELECT id, name, code FROM service_types WHERE is_active = true ORDER BY name`,
      ),
      query<{ id: string; name: string; short_code: string }>(
        `SELECT id, name, short_code FROM entities ORDER BY short_code`,
      ),
    ]);
    return NextResponse.json({ partners, services, entities });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await userHasPermission(session.id, "edit_clients"))) {
      return NextResponse.json({ error: "You do not have permission to edit clients" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      ids?: string[];
      action?: string;
      partner_id?: string;
      service_type_ids?: string[];
      create_engagements?: boolean;
      billing_entity_id?: string;
    };
    const requested = Array.isArray(body.ids) ? Array.from(new Set(body.ids)) : [];
    if (requested.length === 0) {
      return NextResponse.json({ error: "Select at least one client." }, { status: 422 });
    }
    if (requested.length > MAX_IDS) {
      return NextResponse.json({ error: `Select at most ${MAX_IDS} clients at a time.` }, { status: 422 });
    }

    // Only clients the user may see.
    const scope = await getAccessScope(session.id);
    const ids: string[] = [];
    for (const id of requested) {
      if (await canSeeClient(scope, id)) ids.push(id);
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: "None of the selected clients could be found." }, { status: 404 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const ua = req.headers.get("user-agent");
    const audit = (action: string, entity_type: "clients" | "engagement", entity_id: string, changes: Record<string, unknown>) =>
      createAuditLog({
        action,
        entity_type,
        entity_id,
        field_changes: changes as Record<string, { before: unknown; after: unknown }>,
        user_id: session.id,
        ip_address: ip,
        user_agent: ua,
      });

    /* ---------------- assign_partner ---------------- */
    if (body.action === "assign_partner") {
      if (!body.partner_id) return NextResponse.json({ error: "Choose a partner." }, { status: 422 });
      const ok = await query<{ name: string }>(
        `SELECT COALESCE(NULLIF(trim(u.name), ''), u.email) AS name
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND r.name IN ('managing_partner', 'partner') LIMIT 1`,
        [body.partner_id],
      );
      if (ok.length === 0) {
        return NextResponse.json({ error: "The partner in charge must be a Partner or the Managing Partner." }, { status: 422 });
      }
      const done = await query<{ id: string }>(
        `UPDATE clients SET partner_in_charge_id = $1, updated_at = now()
          WHERE id = ANY($2::uuid[]) RETURNING id`,
        [body.partner_id, ids],
      );
      for (const r of done) await audit("bulk_assign_partner", "clients", r.id, { partner_in_charge_id: { before: null, after: ok[0].name } });
      return NextResponse.json({ ok: true, affected: done.length, message: `${ok[0].name} is now partner in charge of ${done.length} clients.` });
    }

    /* ---------------- mark_kyc ---------------- */
    if (body.action === "mark_kyc") {
      const done = await query<{ owner_id: string }>(
        `INSERT INTO onboarding_checklist_items
           (owner_type, owner_id, checklist_item_code, label, is_complete, completed_by, completed_at)
         SELECT 'client', c, 'kyc_signatories', 'KYC/ID proof of signatories', true, $2::uuid, now()
           FROM unnest($1::uuid[]) AS c
         ON CONFLICT (owner_type, owner_id, checklist_item_code) DO UPDATE
           SET is_complete = true, completed_by = EXCLUDED.completed_by, completed_at = now(), updated_at = now()
           WHERE onboarding_checklist_items.is_complete = false
         RETURNING owner_id`,
        [ids, session.id],
      );
      for (const r of done) await audit("bulk_mark_kyc", "clients", r.owner_id, { "KYC verified": { before: false, after: true } });
      return NextResponse.json({
        ok: true,
        affected: done.length,
        message: `${done.length} clients marked KYC verified${ids.length > done.length ? `; ${ids.length - done.length} already were` : ""}.`,
      });
    }

    /* ---------------- start_onboarding ---------------- */
    if (body.action === "start_onboarding") {
      const done = await query<{ id: string }>(
        `UPDATE clients SET onboarding_status = 'kyc_and_docs', updated_at = now()
          WHERE id = ANY($1::uuid[]) AND onboarding_status = 'imported' RETURNING id`,
        [ids],
      );
      for (const r of done) await audit("bulk_start_onboarding", "clients", r.id, { onboarding_status: { before: "imported", after: "kyc_and_docs" } });
      return NextResponse.json({
        ok: true,
        affected: done.length,
        message: `${done.length} clients moved to KYC & Docs${ids.length > done.length ? `; ${ids.length - done.length} were already past Imported` : ""}. Share each client's KYC link from its page.`,
      });
    }

    /* ---------------- set_scope ---------------- */
    if (body.action === "set_scope") {
      const serviceIds = Array.isArray(body.service_type_ids) ? Array.from(new Set(body.service_type_ids)) : [];
      if (serviceIds.length === 0) return NextResponse.json({ error: "Choose at least one service." }, { status: 422 });
      const services = await query<{
        id: string;
        name: string;
        is_attest: boolean;
        is_recurring: boolean;
        recurrence_pattern: string | null;
        default_billing_entity_id: string | null;
        linked_task_library_id: string | null;
      }>(
        `SELECT id, name, is_attest, is_recurring, recurrence_pattern, default_billing_entity_id, linked_task_library_id
           FROM service_types WHERE id = ANY($1::uuid[])`,
        [serviceIds],
      );
      if (services.length !== serviceIds.length) {
        return NextResponse.json({ error: "One or more services could not be found." }, { status: 422 });
      }

      const added = await query<{ client_id: string; service_type_id: string }>(
        `INSERT INTO client_service_scope (client_id, service_type_id)
         SELECT c, s FROM unnest($1::uuid[]) AS c CROSS JOIN unnest($2::uuid[]) AS s
          WHERE NOT EXISTS (SELECT 1 FROM client_service_scope x WHERE x.client_id = c AND x.service_type_id = s)
         RETURNING client_id, service_type_id`,
        [ids, serviceIds],
      );
      const addedByClient = new Map<string, number>();
      for (const a of added) addedByClient.set(a.client_id, (addedByClient.get(a.client_id) ?? 0) + 1);
      for (const [clientId, n] of addedByClient) {
        await audit("bulk_set_scope", "clients", clientId, { services: { before: null, after: `${n} added` } });
      }

      const createdEngagements: string[] = [];
      const skipped: string[] = [];
      if (body.create_engagements) {
        if (ids.length * services.length > MAX_ENGAGEMENTS) {
          return NextResponse.json(
            { error: `That would create more than ${MAX_ENGAGEMENTS} engagements. Choose fewer clients or services.`, services_added: added.length },
            { status: 422 },
          );
        }
        const today = new Date().toISOString().slice(0, 10);
        const entityRows = await query<{ id: string; can_attest: boolean; short_code: string }>(
          `SELECT id, can_attest, short_code FROM entities`,
        );
        const entityById = new Map(entityRows.map((e) => [e.id, e]));
        const clientNames = new Map(
          (await query<{ id: string; name: string; partner_in_charge_id: string | null; financial_year_end_month: number | null }>(
            `SELECT id, name, partner_in_charge_id, financial_year_end_month FROM clients WHERE id = ANY($1::uuid[])`,
            [ids],
          )).map((c) => [c.id, c]),
        );

        for (const clientId of ids) {
          for (const svc of services) {
            const label = `${clientNames.get(clientId)?.name ?? clientId} / ${svc.name}`;
            const entityId = svc.default_billing_entity_id ?? body.billing_entity_id ?? null;
            const entity = entityId ? entityById.get(entityId) : undefined;
            if (!entity) {
              skipped.push(`${label}: no billing entity`);
              continue;
            }
            if (svc.is_attest && !entity.can_attest) {
              skipped.push(`${label}: attest work can't be billed from ${entity.short_code}`);
              continue;
            }
            const period = svc.is_recurring ? currentPeriod(svc.recurrence_pattern, today, clientNames.get(clientId)?.financial_year_end_month) : null;
            const dup = await query<{ id: string }>(
              `SELECT id FROM engagements
                WHERE client_id = $1 AND service_type_id = $2 AND billing_entity_id = $3
                  AND status <> 'cancelled'
                  AND (($4::date IS NULL AND period_start IS NULL) OR period_start = $4::date) LIMIT 1`,
              [clientId, svc.id, entity.id, period?.start ?? null],
            );
            if (dup.length > 0) {
              skipped.push(`${label}: an engagement already exists${period ? " for this period" : ""}`);
              continue;
            }

            const conn = await pool.connect();
            try {
              await conn.query("BEGIN");
              const code = await nextEngagementCode((sql, params) => conn.query(sql, params));
              const ins = await conn.query(
                `INSERT INTO engagements
                   (engagement_code, client_id, service_type_id, billing_entity_id, task_library_id,
                    period_start, period_end, partner_in_charge_id, is_recurring, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING id`,
                [
                  code,
                  clientId,
                  svc.id,
                  entity.id,
                  svc.linked_task_library_id,
                  period?.start ?? null,
                  period?.end ?? null,
                  clientNames.get(clientId)?.partner_in_charge_id ?? null,
                  svc.is_recurring,
                ],
              );
              await conn.query("COMMIT");
              createdEngagements.push(code);
              await audit("create_engagement", "engagement", ins.rows[0].id as string, {
                engagement_code: { before: null, after: code },
                source: { before: null, after: "bulk scope selection" },
              });
            } catch (err) {
              await conn.query("ROLLBACK").catch(() => {});
              skipped.push(`${label}: ${err instanceof Error ? err.message : "could not be created"}`);
            } finally {
              conn.release();
            }
          }
        }
      }

      return NextResponse.json({
        ok: true,
        affected: ids.length,
        services_added: added.length,
        engagements_created: createdEngagements.length,
        skipped,
        message:
          `${added.length} services added across ${addedByClient.size} clients` +
          (body.create_engagements ? `; ${createdEngagements.length} draft engagements created` : "") +
          (skipped.length ? `; ${skipped.length} skipped` : "") +
          ".",
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
