/**
 * DELETE /api/engagements/:id — TEMPORARY test clean-up (Gap #46, not in the PDF).
 *
 * Managing Partner only, and only for engagements still in Draft. Removes the
 * engagement together with its tasks, delay-reason records and team. Refused
 * when the engagement is linked to an invoice. To be removed or replaced by the
 * PDF's own cancel / archive flow before go-live.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool, query } from "@/lib/db";
import { requireRole, requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { currentPeriod, recomputeForUsers } from "@/lib/payroll-readiness";
import { canSeeEngagement, getAccessScope } from "@/lib/access-scope";

/**
 * PATCH /api/engagements/:id  { action, reason?, override? }  (FR-44 lifecycle, Gap #65)
 *
 *   activate   Draft → Active                          create_engagements
 *   hold       Active → On hold                        create_engagements
 *   resume     On hold → Active                        create_engagements
 *   complete   Active / On hold → Completed            Managing Partner or Partner.
 *              Needs every task closed, unless the Managing Partner overrides with a reason.
 *              A completed engagement is ready to bill.
 *   reopen     Completed → Active                      Managing Partner or Partner
 *   cancel     Draft / Active / On hold → Cancelled    Managing Partner or Partner, with a reason.
 *              Refused while a raised invoice is linked. Open tasks are closed as not applicable
 *              so they stop counting against anyone's salary readiness.
 */
const PARTNER_ROLES = ["managing_partner", "partner"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "create_engagements");
    const { id } = await params;
    if (!(await canSeeEngagement(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string; override?: boolean };
    const action = body.action ?? "";
    const reason = (body.reason ?? "").trim();

    const rows = await query<{ id: string; engagement_code: string; status: string }>(
      `SELECT id, engagement_code, status FROM engagements WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    const eng = rows[0];
    const partner = PARTNER_ROLES.includes(user.roleName);

    let next: string;
    if (action === "activate") {
      if (eng.status !== "draft") return NextResponse.json({ error: "Only a Draft engagement can be activated." }, { status: 409 });
      next = "active";
    } else if (action === "hold") {
      if (!["active", "in_progress"].includes(eng.status)) {
        return NextResponse.json({ error: "Only an Active engagement can be put on hold." }, { status: 409 });
      }
      next = "on_hold";
    } else if (action === "resume") {
      if (eng.status !== "on_hold") return NextResponse.json({ error: "Only an engagement on hold can be resumed." }, { status: 409 });
      next = "active";
    } else if (action === "complete" || action === "reopen" || action === "cancel") {
      if (!partner) {
        return NextResponse.json(
          { error: "Only the Managing Partner or a Partner can complete, reopen or cancel an engagement." },
          { status: 403 },
        );
      }
      if (action === "reopen") {
        if (eng.status !== "completed") return NextResponse.json({ error: "Only a completed engagement can be reopened." }, { status: 409 });
        next = "active";
      } else if (action === "complete") {
        if (!["active", "in_progress", "on_hold"].includes(eng.status)) {
          return NextResponse.json({ error: "Only an Active engagement can be marked complete." }, { status: 409 });
        }
        const open = await query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM task_instances WHERE engagement_id = $1 AND status NOT IN ('completed', 'not_applicable')`,
          [id],
        );
        const openCount = parseInt(open[0]?.n ?? "0", 10);
        if (openCount > 0) {
          const canOverride = user.roleName === "managing_partner" && body.override === true && reason;
          if (!canOverride) {
            return NextResponse.json(
              {
                error:
                  `${openCount} task${openCount === 1 ? " is" : "s are"} still open. Finish or close them first.` +
                  (user.roleName === "managing_partner" ? " As Managing Partner you can complete it anyway with a written reason." : ""),
                open_tasks: openCount,
              },
              { status: 409 },
            );
          }
        }
        next = "completed";
      } else {
        if (!["draft", "active", "in_progress", "on_hold"].includes(eng.status)) {
          return NextResponse.json({ error: "This engagement can't be cancelled." }, { status: 409 });
        }
        if (!reason) return NextResponse.json({ error: "Write a short reason for cancelling this engagement." }, { status: 422 });
        const billed = await query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM invoice_engagements ie JOIN invoices i ON i.id = ie.invoice_id
            WHERE ie.engagement_id = $1 AND i.status NOT IN ('draft', 'cancelled')`,
          [id],
        );
        if (parseInt(billed[0]?.n ?? "0", 10) > 0) {
          return NextResponse.json(
            { error: "A raised invoice is linked to this engagement. Cancel or write off the invoice first." },
            { status: 409 },
          );
        }
        next = "cancelled";
      }
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 422 });
    }

    let closedTasks = 0;
    if (next === "cancelled") {
      const doers = await query<{ assigned_to: string }>(
        `SELECT DISTINCT assigned_to FROM task_instances
          WHERE engagement_id = $1 AND assigned_to IS NOT NULL AND status NOT IN ('completed', 'not_applicable')`,
        [id],
      );
      const closed = await query<{ id: string }>(
        `UPDATE task_instances SET status = 'not_applicable', updated_at = now(), version = version + 1
          WHERE engagement_id = $1 AND status NOT IN ('completed', 'not_applicable') RETURNING id`,
        [id],
      );
      closedTasks = closed.length;
      if (doers.length) {
        try {
          await recomputeForUsers(doers.map((d) => d.assigned_to), [currentPeriod()]);
        } catch (err) {
          console.error("[engagements] payroll recompute after cancel failed:", err);
        }
      }
    }
    await query(`UPDATE engagements SET status = $2, updated_at = now() WHERE id = $1`, [id, next]);

    await createAuditLog({
      action: "status_change",
      entity_type: "engagement",
      entity_id: id,
      field_changes: {
        status: { before: eng.status, after: next },
        ...(reason ? { reason: { before: null, after: reason } } : {}),
        ...(closedTasks ? { tasks_closed_as_not_applicable: { before: 0, after: closedTasks } } : {}),
      },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, status: next, tasks_closed: closedTasks });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("PATCH /api/engagements/:id error:", err);
    return NextResponse.json({ error: "That didn't work. Please try again." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let actorId: string;
  try {
    const actor = await requireRole(req, "managing_partner");
    actorId = actor.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  const { id } = await params;
  try {
    const rows = await query<{ id: string; engagement_code: string; status: string }>(
      `SELECT id, engagement_code, status FROM engagements WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    const engagement = rows[0];
    if (engagement.status !== "draft") {
      return NextResponse.json(
        { error: "Only engagements still in Draft can be deleted." },
        { status: 409 },
      );
    }

    const doers = await query<{ assigned_to: string }>(
      `SELECT DISTINCT assigned_to FROM task_instances WHERE engagement_id = $1 AND assigned_to IS NOT NULL`,
      [id],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM delay_reason_dispositions
          WHERE task_instance_id IN (SELECT id FROM task_instances WHERE engagement_id = $1)`,
        [id],
      );
      await client.query(`DELETE FROM engagements WHERE id = $1`, [id]); // tasks and team follow
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if ((err as { code?: string })?.code === "23503") {
        return NextResponse.json(
          { error: "This engagement is linked to an invoice or other records and can't be deleted." },
          { status: 409 },
        );
      }
      throw err;
    } finally {
      client.release();
    }

    await createAuditLog({
      action: "delete",
      entity_type: "engagement",
      entity_id: id,
      field_changes: { engagement: { before: engagement.engagement_code, after: null } },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    if (doers.length) {
      try {
        await recomputeForUsers(doers.map((d) => d.assigned_to), [currentPeriod()]);
      } catch (err) {
        console.error("[engagements] payroll recompute after delete failed:", err);
      }
    }

    return NextResponse.json({ deleted: true, engagement_code: engagement.engagement_code });
  } catch (err: unknown) {
    console.error("DELETE /api/engagements/:id error:", err);
    return NextResponse.json({ error: "The engagement couldn't be deleted. Please try again." }, { status: 500 });
  }
}
