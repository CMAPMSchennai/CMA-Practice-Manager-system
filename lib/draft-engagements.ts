/**
 * Draft engagements from a client's scope of services (FR-37).
 *
 * Used when a client submits the onboarding form: each service they choose
 * gets a draft engagement for the current period, as long as the billing
 * entity is known. Services with no default billing entity are listed in
 * `skipped`, so staff can create them with the bulk "Set scope" action once
 * the entity is decided. Existing engagements for the same period are never
 * duplicated.
 */
import { pool, query } from "@/lib/db";
import { nextEngagementCode } from "@/lib/engagement-code";
import { currentPeriod } from "@/lib/engagement-period";
import { createAuditLog } from "@/lib/audit";

export interface DraftResult {
  created: string[];
  skipped: string[];
}

export async function createDraftEngagements(opts: {
  clientId: string;
  serviceIds: string[];
  actorId: string | null;
  source: string;
  billingEntityId?: string | null;
}): Promise<DraftResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  if (opts.serviceIds.length === 0) return { created, skipped };

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
       FROM service_types WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [opts.serviceIds],
  );
  const entities = await query<{ id: string; can_attest: boolean; short_code: string }>(
    `SELECT id, can_attest, short_code FROM entities`,
  );
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const client = await query<{ name: string; partner_in_charge_id: string | null; financial_year_end_month: number | null }>(
    `SELECT name, partner_in_charge_id, financial_year_end_month FROM clients WHERE id = $1 LIMIT 1`,
    [opts.clientId],
  );
  const today = new Date().toISOString().slice(0, 10);

  for (const svc of services) {
    const entityId = svc.default_billing_entity_id ?? opts.billingEntityId ?? null;
    const entity = entityId ? entityById.get(entityId) : undefined;
    if (!entity) {
      skipped.push(`${svc.name}: no billing entity decided yet`);
      continue;
    }
    if (svc.is_attest && !entity.can_attest) {
      skipped.push(`${svc.name}: attest work can't be billed from ${entity.short_code}`);
      continue;
    }
    const period = svc.is_recurring ? currentPeriod(svc.recurrence_pattern, today, client[0]?.financial_year_end_month) : null;
    const dup = await query<{ id: string }>(
      `SELECT id FROM engagements
        WHERE client_id = $1 AND service_type_id = $2 AND billing_entity_id = $3
          AND status <> 'cancelled'
          AND (($4::date IS NULL AND period_start IS NULL) OR period_start = $4::date) LIMIT 1`,
      [opts.clientId, svc.id, entity.id, period?.start ?? null],
    );
    if (dup.length > 0) {
      skipped.push(`${svc.name}: an engagement already exists${period ? " for this period" : ""}`);
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
          opts.clientId,
          svc.id,
          entity.id,
          svc.linked_task_library_id,
          period?.start ?? null,
          period?.end ?? null,
          client[0]?.partner_in_charge_id ?? null,
          svc.is_recurring,
        ],
      );
      await conn.query("COMMIT");
      created.push(code);
      if (opts.actorId) {
        await createAuditLog({
          action: "create_engagement",
          entity_type: "engagement",
          entity_id: ins.rows[0].id as string,
          field_changes: {
            engagement_code: { before: null, after: code },
            source: { before: null, after: opts.source },
          },
          user_id: opts.actorId,
        });
      }
    } catch (err) {
      await conn.query("ROLLBACK").catch(() => {});
      skipped.push(`${svc.name}: ${err instanceof Error ? err.message : "could not be created"}`);
    } finally {
      conn.release();
    }
  }
  return { created, skipped };
}
