import { NextRequest, NextResponse } from "next/server";
import { query, pool } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { engagementVisibleSql, getAccessScope } from "@/lib/access-scope";
import { nextEngagementCode } from "@/lib/engagement-code";
import { maybeRunRecurring } from "@/lib/recurring-engagements";
import { FEE_BASES } from "@/lib/fee-basis";

/**
 * GET /api/engagements — list engagements (filterable)
 * POST /api/engagements — create a new engagement
 *
 * AC-1: POST with valid body → 201 with { id, engagement_code, status: 'draft' }
 * AC-2: POST with is_attest service and non-CMA billing entity → 422 ATTEST_ENTITY_VIOLATION
 * AC-3: POST without create_engagements permission → 403
 */

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_engagements");

    // FR-06 / FR-55: create next periods of recurring engagements when they fall due
    // (at most every 30 minutes, and only when an engagement creator opens the list).
    if (await userHasPermission(user.id, "create_engagements")) {
      await maybeRunRecurring(user.id);
    }

    const url = req.nextUrl;
    const clientId = url.searchParams.get("client_id");
    const status = url.searchParams.get("status");
    const kind = url.searchParams.get("kind"); // FR-44: recurring or one_time
    const entityId = url.searchParams.get("entity_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (clientId) {
      conditions.push(`e.client_id = $${idx++}`);
      params.push(clientId);
    }
    if (status) {
      conditions.push(`e.status = $${idx++}`);
      params.push(status);
    }
    if (entityId) {
      conditions.push(`e.billing_entity_id = $${idx++}`);
      params.push(entityId);
    }
    if (kind === "recurring") conditions.push(`e.is_recurring = true`);
    else if (kind === "one_time") conditions.push(`e.is_recurring = false`);

    // FR-03: only engagements within the user's scope.
    const scope = await getAccessScope(user.id, user.roleName);
    if (scope.mode !== "all") {
      conditions.push(engagementVisibleSql(scope, "e.id", idx++));
      params.push(user.id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT e.id, e.engagement_code, e.client_id, e.service_type_id,
              e.billing_entity_id, e.task_library_id, e.task_library_version_used,
              e.period_start, e.period_end, e.fee_basis, e.agreed_fee,
              e.reimbursement_heads, e.status,
              e.partner_in_charge_id, e.is_recurring, e.notes,
              e.created_at, e.updated_at,
              -- FR-46: progress comes from completed tasks, never typed in (0 to 100).
              COALESCE(ROUND(100.0 *
                (SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status = 'completed')
                / NULLIF((SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status <> 'not_applicable'), 0)
              ), 0)::int AS progress_pct,
              (SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status = 'completed')::int AS tasks_done,
              (SELECT COUNT(*) FROM task_instances t WHERE t.engagement_id = e.id AND t.status <> 'not_applicable')::int AS tasks_total,
              (SELECT string_agg(DISTINCT COALESCE(NULLIF(trim(tu.name), ''), tu.email), ', ')
                 FROM task_instances t JOIN users tu ON tu.id = t.assigned_to
                WHERE t.engagement_id = e.id AND t.status <> 'not_applicable') AS assigned_to_names,
              CASE WHEN st.description ILIKE 'Category:%' THEN trim(substr(st.description, 10)) ELSE st.name END AS service_line,
              c.name AS client_name,
              st.name AS service_type_name,
              ent.name AS billing_entity_name
       FROM engagements e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN service_types st ON st.id = e.service_type_id
       LEFT JOIN entities ent ON ent.id = e.billing_entity_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    // §4: Paid Assistants and Articled Clerks have no fee visibility.
    const feeVisible = await userHasPermission(user.id, "view_billing");
    // TEMPORARY (Gap #46): the MP may delete a Draft engagement while testing.
    const canManage = await userHasPermission(user.id, "create_engagements");
    const isPartner = ["managing_partner", "partner"].includes(user.roleName);
    const engagements = rows.map((r) => {
      const base = {
        ...r,
        can_delete: user.roleName === "managing_partner" && r.status === "draft",
        can_manage: canManage,
        can_partner: isPartner,
        is_mp: user.roleName === "managing_partner",
      };
      return feeVisible
        ? { ...base, fee_visible: true }
        : { ...base, agreed_fee: null, fee_basis: null, reimbursement_heads: null, fee_visible: false };
    });

    // The screen only offers "New Engagement" to roles that may create one.
    const canCreate = await userHasPermission(user.id, "create_engagements");
    return NextResponse.json({ engagements, can_create: canCreate }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "create_engagements");

    const body = await req.json();
    const {
      client_id,
      service_type_id,
      billing_entity_id,
      period_start,
      period_end,
      fee_basis,
      agreed_fee,
      reimbursement_heads,
      partner_in_charge_id,
      is_recurring,
      notes,
      team, // optional: Array<{ user_id: string; role_in_engagement: string }>
      needs_checklist, // false = a simple job: one task, no checklist (Gap #78)
    } = body as {
      needs_checklist?: boolean;
      client_id?: string;
      service_type_id?: string;
      billing_entity_id?: string;
      period_start?: string;
      period_end?: string;
      fee_basis?: string;
      agreed_fee?: number;
      reimbursement_heads?: unknown;
      partner_in_charge_id?: string;
      is_recurring?: boolean;
      notes?: string;
      team?: Array<{ user_id: string; role_in_engagement: string }>;
    };

    // Validate required fields
    if (!client_id || !service_type_id || !billing_entity_id) {
      return NextResponse.json(
        { error: "client_id, service_type_id, and billing_entity_id are required" },
        { status: 422 }
      );
    }

    // Gap #78: the person creating the job must say whether it needs a checklist.
    if (typeof needs_checklist !== "boolean") {
      return NextResponse.json(
        { error: "Choose whether this job needs a checklist (Yes or No)." },
        { status: 422 }
      );
    }

    if (fee_basis && !FEE_BASES.some((b) => b.v === fee_basis)) {
      return NextResponse.json(
        { error: `Fee basis must be one of: ${FEE_BASES.map((b) => b.l).join(", ")}.` },
        { status: 422 }
      );
    }

    // Validate client exists
    const clientRows = await query<{ id: string }>(
      `SELECT id FROM clients WHERE id = $1`,
      [client_id]
    );
    if (clientRows.length === 0) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Validate service type exists and check is_attest
    const stRows = await query<{
      id: string;
      is_attest: boolean;
      linked_task_library_id: string | null;
      is_recurring: boolean;
      name: string;
    }>(
      `SELECT id, is_attest, linked_task_library_id, is_recurring, name FROM service_types WHERE id = $1`,
      [service_type_id]
    );
    if (stRows.length === 0) {
      return NextResponse.json({ error: "Service type not found" }, { status: 404 });
    }
    const serviceType = stRows[0];

    // Validate billing entity exists and check can_attest for attest services
    const entityRows = await query<{ id: string; can_attest: boolean; short_code: string }>(
      `SELECT id, can_attest, short_code FROM entities WHERE id = $1`,
      [billing_entity_id]
    );
    if (entityRows.length === 0) {
      return NextResponse.json({ error: "Billing entity not found" }, { status: 404 });
    }
    const billingEntity = entityRows[0];

    // AC-2: Attest work must be billed from an entity that can_attest (CMA LLP)
    if (serviceType.is_attest && !billingEntity.can_attest) {
      return NextResponse.json(
        {
          error: "ATTEST_ENTITY_VIOLATION",
          message: `Attest service "${serviceType.name}" must be billed from an entity that can perform attest work (CMA LLP). Entity "${billingEntity.short_code}" cannot perform attest work.`,
        },
        { status: 422 }
      );
    }

    // Generate engagement code: ENG-YYYYMM-NNNN (highest used + 1, so deletions can't repeat a code)
    const engagementCode = await nextEngagementCode();

    // Insert engagement in a transaction (with optional team members)
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertResult = await client.query(
        `INSERT INTO engagements
           (engagement_code, client_id, service_type_id, billing_entity_id,
            task_library_id, period_start, period_end, fee_basis, agreed_fee,
            reimbursement_heads, partner_in_charge_id, is_recurring, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
         RETURNING id, engagement_code, status, created_at`,
        [
          engagementCode,
          client_id,
          service_type_id,
          billing_entity_id,
          serviceType.linked_task_library_id || null,
          period_start || null,
          period_end || null,
          fee_basis || null,
          agreed_fee != null ? agreed_fee : null,
          reimbursement_heads ? JSON.stringify(reimbursement_heads) : null,
          partner_in_charge_id || null,
          is_recurring ?? serviceType.is_recurring ?? false,
          notes || null,
        ]
      );

      const created = insertResult.rows[0];

      // Insert team members if provided
      if (Array.isArray(team) && team.length > 0) {
        for (const member of team) {
          if (member.user_id) {
            await client.query(
              `INSERT INTO engagement_team (engagement_id, user_id, role_in_engagement)
               VALUES ($1, $2, $3)
               ON CONFLICT (engagement_id, user_id) DO NOTHING`,
              [created.id, member.user_id, member.role_in_engagement || null]
            );
          }
        }
      }

      // Gap #78: a job with no checklist gets one ordinary task, so assigning, review,
      // approval, delay reasons and payroll readiness all work as for any other task.
      // Its due date is the end of the period.
      const simpleJob = needs_checklist === false;
      if (simpleJob) {
        await client.query(
          `INSERT INTO task_instances
             (engagement_id, library_area_name, library_subtask_name, step_code, title,
              status, priority, due_date, sort_order)
           VALUES ($1, 'Job', 'Job', 'JOB-01', $2, 'not_started', 'medium', NULL, 1)`,
          [created.id, serviceType.name],
        );
      }

      await client.query("COMMIT");

      // Audit log
      await createAuditLog({
        action: "create_engagement",
        entity_type: "engagement",
        entity_id: created.id,
        field_changes: {
          engagement_code: { before: null, after: engagementCode },
          client_id: { before: null, after: client_id },
          service_type_id: { before: null, after: service_type_id },
          billing_entity_id: { before: null, after: billing_entity_id },
          status: { before: null, after: "draft" },
          ...(needs_checklist === false ? { checklist: { before: null, after: "none (simple job)" } } : {}),
        },
        user_id: user.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });

      return NextResponse.json(
        {
          id: created.id,
          engagement_code: created.engagement_code,
          status: created.status,
          created_at: created.created_at,
        },
        { status: 201 }
      );
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
