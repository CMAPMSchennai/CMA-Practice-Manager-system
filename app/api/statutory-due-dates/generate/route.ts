import { NextRequest, NextResponse } from "next/server";
import { query, pool } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { clientVisibleSql, getAccessScope } from "@/lib/access-scope";
import {
  PERIOD_HELP,
  computeDueDate,
  parsePeriod,
  ruleApplies,
  type CalendarRule,
  type ClientForEngine,
} from "@/lib/statutory-engine";

/**
 * POST /api/statutory-due-dates/generate (FR-65, FR-66)
 *
 * Generates statutory due dates from the active calendar rules, each client's
 * services and each client's entity type.
 *
 * Body: { period_label: string, client_id?: UUID }
 *   With client_id: that client. Without it: every active client the user may see.
 *   period_label: 2026-10 (monthly) · Q2-2026 (quarterly) · H1-2026 (half-yearly) · FY2026-27 (annual)
 *
 * Returns { created, already_there, clients, period_label }.
 * Existing due dates for the same client, rule and period are never duplicated.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "manage_compliance");

    const body = (await req.json().catch(() => ({}))) as { client_id?: string; period_label?: string };
    const periodLabel = body.period_label?.trim();
    if (!periodLabel) {
      return NextResponse.json({ error: "period_label is required" }, { status: 422 });
    }
    const period = parsePeriod(periodLabel);
    if (!period) {
      return NextResponse.json({ error: `Period not recognised. ${PERIOD_HELP}` }, { status: 422 });
    }

    // Clients to generate for (with their entity type code).
    const conditions: string[] = ["c.is_active = true"];
    const params: unknown[] = [];
    if (body.client_id) {
      params.push(body.client_id);
      conditions.push(`c.id = $${params.length}`);
    }
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all") {
      params.push(user.id);
      conditions.push(clientVisibleSql(scope, "c.id", params.length));
    }
    const clients = await query<ClientForEngine>(
      `SELECT c.id, c.partner_in_charge_id, rd.code AS entity_type_code
         FROM clients c
         LEFT JOIN reference_data rd ON rd.id = c.entity_type_id
        WHERE ${conditions.join(" AND ")}`,
      params,
    );
    if (clients.length === 0) {
      return NextResponse.json(
        { error: body.client_id ? "Client not found" : "There are no clients to generate for." },
        { status: body.client_id ? 404 : 422 },
      );
    }

    const rules = await query<CalendarRule>(
      `SELECT id, name, form_or_return, frequency, due_day_of_month, due_date_logic,
              applicable_entity_types, applicable_service_type_id
         FROM statutory_calendar_rules
        WHERE is_active = true`,
    );

    const scopeRows = await query<{ client_id: string; service_type_id: string }>(
      `SELECT client_id, service_type_id FROM client_service_scope WHERE client_id = ANY($1::uuid[])`,
      [clients.map((c) => c.id)],
    );
    const servicesByClient = new Map<string, Set<string>>();
    for (const r of scopeRows) {
      if (!servicesByClient.has(r.client_id)) servicesByClient.set(r.client_id, new Set());
      servicesByClient.get(r.client_id)!.add(r.service_type_id);
    }

    const existingRows = await query<{ client_id: string; rule_id: string }>(
      `SELECT client_id, rule_id FROM statutory_due_dates WHERE period_label = $1`,
      [periodLabel],
    );
    const existing = new Set(existingRows.map((r) => `${r.client_id}:${r.rule_id}`));

    let created = 0;
    let alreadyThere = 0;
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      for (const client of clients) {
        const services = servicesByClient.get(client.id) ?? new Set<string>();
        for (const rule of rules) {
          if (ruleApplies(rule, client, services, period) !== "yes") continue;
          const dueDate = computeDueDate(rule, period);
          if (!dueDate) continue;
          if (existing.has(`${client.id}:${rule.id}`)) {
            alreadyThere++;
            continue;
          }
          const name = rule.form_or_return ? `${rule.name} — ${rule.form_or_return}` : rule.name;
          await conn.query(
            `INSERT INTO statutory_due_dates
               (client_id, rule_id, obligation_name, due_date, period_label,
                status, escalation_level, owner_id)
             VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6)`,
            [client.id, rule.id, name, dueDate, periodLabel, client.partner_in_charge_id],
          );
          existing.add(`${client.id}:${rule.id}`);
          created++;
        }
      }
      await conn.query("COMMIT");
    } catch (txErr) {
      await conn.query("ROLLBACK");
      throw txErr;
    } finally {
      conn.release();
    }

    await createAuditLog({
      action: "generate_statutory_due_dates",
      entity_type: "statutory_due_dates",
      entity_id: body.client_id ?? user.id,
      field_changes: {
        period_label: { before: null, after: periodLabel },
        clients: { before: null, after: clients.length },
        created: { before: null, after: created },
      },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json(
      { created, already_there: alreadyThere, clients: clients.length, period_label: periodLabel },
      { status: 201 },
    );
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
