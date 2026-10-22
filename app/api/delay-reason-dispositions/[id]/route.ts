/**
 * PATCH /api/delay-reason-dispositions/:id — partner action on a logged delay reason (FR-59, FR-60).
 *
 * Body: { action, notes?, new_assignee_id? }
 *   accept           — genuine client-side delay; clears the payroll block (FR-60)
 *   counsel          — block stays; notes become a performance note (FR-60, FR-62) — notes required
 *   reassign         — task moves to new_assignee_id now; a DR-06 "pending handover" item is
 *                      opened against the original assignee, who stays blocked until the
 *                      partner approves the handover (Gap #17, DR-06, FR-56)
 *   escalate         — recorded as a client-side delay escalated to the client; block clears;
 *                      noted on the client's timeline (Gap #18, FR-13)
 *   approve_handover — only on DR-06 items; the task no longer counts against the original
 *                      assignee (FR-56)
 *
 * Who may act (§4): the Managing Partner on any item; a Partner only on items from
 * engagements (or clients) where they are partner-in-charge. Each item is actioned once.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool, query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { getUserRoleName, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { checkAssigneeEligibility } from "@/lib/task-assignment";
import { currentPeriod, recomputeForUsers } from "@/lib/payroll-readiness";

const ACTIONS = ["accept", "counsel", "reassign", "escalate", "approve_handover"] as const;
type Action = (typeof ACTIONS)[number];

const HANDOVER_REASON_CODE = "DR-06";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    const roleName = await getUserRoleName(user.id);
    if (roleName !== "managing_partner" && roleName !== "partner") {
      return NextResponse.json(
        { error: "Only the Managing Partner or a Partner can act on delay reasons" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      notes?: unknown;
      new_assignee_id?: unknown;
    };
    const action = body.action as Action;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const newAssigneeId = typeof body.new_assignee_id === "string" ? body.new_assignee_id : "";

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${ACTIONS.join(", ")}` },
        { status: 422 },
      );
    }

    const rows = await query<{
      id: string;
      task_instance_id: string;
      logged_by: string;
      disposition_action: string | null;
      reason_code: string | null;
      reason_label: string | null;
      task_title: string;
      due_month: string | null;
      assigned_to: string | null;
      reviewer: string | null;
      engagement_id: string;
      engagement_pic: string | null;
      client_id: string | null;
      client_pic: string | null;
    }>(
      `SELECT d.id, d.task_instance_id, d.logged_by, d.disposition_action,
              rd.code AS reason_code, rd.label AS reason_label,
              ti.title AS task_title, to_char(ti.due_date, 'YYYY-MM') AS due_month,
              ti.assigned_to, ti.reviewer, ti.engagement_id,
              e.partner_in_charge_id AS engagement_pic,
              e.client_id, c.partner_in_charge_id AS client_pic
         FROM delay_reason_dispositions d
         JOIN task_instances ti ON ti.id = d.task_instance_id
         JOIN engagements e ON e.id = ti.engagement_id
         LEFT JOIN clients c ON c.id = e.client_id
         LEFT JOIN reference_data rd ON rd.id = d.reason_id
        WHERE d.id = $1
        LIMIT 1`,
      [id],
    );
    const item = rows[0];
    if (!item) {
      return NextResponse.json({ error: "Delay reason not found" }, { status: 404 });
    }

    if (
      roleName === "partner" &&
      item.engagement_pic !== user.id &&
      item.client_pic !== user.id
    ) {
      return NextResponse.json(
        { error: "Partners can only act on items from their own engagements" },
        { status: 403 },
      );
    }
    if (item.disposition_action) {
      return NextResponse.json(
        { error: `This item has already been actioned (${item.disposition_action})` },
        { status: 409 },
      );
    }
    if (action === "approve_handover" && item.reason_code !== HANDOVER_REASON_CODE) {
      return NextResponse.json(
        { error: "Approve handover only applies to 'Reassigned — pending handover' items" },
        { status: 422 },
      );
    }
    if (action === "counsel" && !notes) {
      return NextResponse.json(
        { error: "Counselling requires a performance note" },
        { status: 422 },
      );
    }

    let newAssigneeName: string | null = null;
    if (action === "reassign") {
      if (!newAssigneeId) {
        return NextResponse.json({ error: "Choose who to reassign the task to" }, { status: 422 });
      }
      if (newAssigneeId === item.assigned_to) {
        return NextResponse.json(
          { error: "The task is already assigned to this person" },
          { status: 422 },
        );
      }
      if (newAssigneeId === item.reviewer) {
        return NextResponse.json(
          { error: "The reviewer cannot also be the assignee (maker–checker, FR-51)" },
          { status: 422 },
        );
      }
      const eligibility = await checkAssigneeEligibility(newAssigneeId);
      if (!eligibility.ok) {
        return NextResponse.json(
          { error: eligibility.code, message: eligibility.message },
          { status: 422 },
        );
      }
      const names = await query<{ name: string | null }>(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`,
        [newAssigneeId],
      );
      newAssigneeName = names[0]?.name ?? null;
    }

    let handoverReasonId: string | null = null;
    if (action === "reassign" && item.assigned_to) {
      const reason = await query<{ id: string }>(
        `SELECT id FROM reference_data WHERE type = 'delay_reason' AND code = $1 LIMIT 1`,
        [HANDOVER_REASON_CODE],
      );
      handoverReasonId = reason[0]?.id ?? null;
      if (!handoverReasonId) {
        return NextResponse.json(
          { error: "Delay reason DR-06 (Reassigned — pending handover) is missing from Reference Data" },
          { status: 500 },
        );
      }
    }

    const client = await pool.connect();
    let handoverItemId: string | null = null;
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE delay_reason_dispositions
            SET disposition_action = $2,
                disposition_notes = $3,
                dispositioned_by = $4,
                dispositioned_at = now(),
                updated_at = now()
          WHERE id = $1 AND disposition_action IS NULL`,
        [item.id, action, notes || null, user.id],
      );
      if (updated.rowCount === 0) {
        throw { status: 409, message: "This item has already been actioned" };
      }

      if (action === "reassign") {
        await client.query(
          `UPDATE task_instances
              SET assigned_to = $2, updated_at = now(), version = version + 1
            WHERE id = $1`,
          [item.task_instance_id, newAssigneeId],
        );
        if (item.assigned_to && handoverReasonId) {
          // The original assignee stays blocked until the handover is approved (DR-06).
          const handover = await client.query<{ id: string }>(
            `INSERT INTO delay_reason_dispositions
               (task_instance_id, reason_id, free_text, logged_by, logged_at)
             VALUES ($1, $2, $3, $4, now())
             RETURNING id`,
            [
              item.task_instance_id,
              handoverReasonId,
              `Reassigned to ${newAssigneeName ?? "another team member"} by partner. Pending handover approval.`,
              item.assigned_to,
            ],
          );
          handoverItemId = handover.rows[0].id;
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
    const ua = req.headers.get("user-agent");

    // The employee the item concerns: the original assignee for a DR-06 handover
    // item (who it was logged against), otherwise the task's assignee at this moment.
    const employeeUserId =
      item.reason_code === HANDOVER_REASON_CODE ? item.logged_by : item.assigned_to;

    await createAuditLog({
      action: `disposition_${action}`,
      entity_type: "delay_reason_disposition",
      entity_id: item.id,
      field_changes: {
        disposition_action: { before: null, after: action },
        employee_user_id: { before: null, after: employeeUserId },
        ...(notes ? { disposition_notes: { before: null, after: notes } } : {}),
        ...(handoverItemId ? { handover_item_id: { before: null, after: handoverItemId } } : {}),
      },
      user_id: user.id,
      ip_address: ip,
      user_agent: ua,
    });

    if (action === "reassign") {
      await createAuditLog({
        action: "reassign",
        entity_type: "task_instance",
        entity_id: item.task_instance_id,
        field_changes: { assigned_to: { before: item.assigned_to, after: newAssigneeId } },
        user_id: user.id,
        ip_address: ip,
        user_agent: ua,
      });
    }

    if (action === "escalate" && item.client_id) {
      // Appears on the client's activity timeline for follow-up (Gap #18, FR-28).
      await createAuditLog({
        action: "delay_escalated_to_client",
        entity_type: "clients",
        entity_id: item.client_id,
        field_changes: {
          task: { before: null, after: item.task_title },
          reason: { before: null, after: item.reason_label },
          ...(notes ? { note: { before: null, after: notes } } : {}),
        },
        user_id: user.id,
        ip_address: ip,
        user_agent: ua,
      });
    }

    // FR-60: salary status updates as soon as the partner acts.
    try {
      await recomputeForUsers(
        [employeeUserId, action === "reassign" ? newAssigneeId : null],
        [currentPeriod(), ...(item.due_month ? [item.due_month] : [])],
      );
    } catch (recomputeErr) {
      console.error("[disposition] payroll recompute failed:", recomputeErr);
    }

    return NextResponse.json({
      id: item.id,
      disposition_action: action,
      handover_item_id: handoverItemId,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
