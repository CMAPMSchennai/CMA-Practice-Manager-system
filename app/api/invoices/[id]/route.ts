/**
 * PATCH /api/invoices/:id  { action }  (Gap #53)
 *   issue      draft → issued           create_invoices
 *   send       issued → sent            create_invoices
 *   cancel     draft / issued / sent → cancelled, only while nothing is received   edit_invoices
 *   write_off  open invoice with a balance → written off                           edit_invoices
 * edit_invoices belongs to the Managing Partner, Partners and Admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { handleRbacError, userHasPermission } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { OPEN_STATUSES, SETTLED_SQL } from "@/lib/invoice-status";

type Action = "issue" | "send" | "cancel" | "write_off";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: Action };
    const action = body.action;
    if (!action || !["issue", "send", "cancel", "write_off"].includes(action)) {
      return NextResponse.json({ error: "action must be issue, send, cancel or write_off." }, { status: 422 });
    }

    const needed = action === "issue" || action === "send" ? "create_invoices" : "edit_invoices";
    if (!(await userHasPermission(user.id, needed))) {
      return NextResponse.json(
        {
          error:
            action === "cancel" || action === "write_off"
              ? "Only the Managing Partner, a Partner or Admin can cancel or write off an invoice."
              : "You do not have permission to issue invoices.",
        },
        { status: 403 },
      );
    }

    const rows = await query<{
      id: string;
      invoice_number: string;
      status: string;
      total_amount: number;
      settled: number;
      lines: number;
    }>(
      `SELECT i.id, i.invoice_number, i.status, i.total_amount::float8 AS total_amount,
              ${SETTLED_SQL} AS settled,
              COALESCE(jsonb_array_length(i.line_items), 0)::int AS lines
         FROM invoices i WHERE i.id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    const inv = rows[0];

    let next: string;
    if (action === "issue") {
      if (inv.status !== "draft") {
        return NextResponse.json({ error: "Only a Draft invoice can be issued." }, { status: 409 });
      }
      if (inv.lines === 0 || Number(inv.total_amount) <= 0) {
        return NextResponse.json({ error: "An invoice needs at least one fee line and a total above zero." }, { status: 422 });
      }
      next = "issued";
    } else if (action === "send") {
      if (inv.status !== "issued") {
        return NextResponse.json({ error: "Only an issued invoice can be marked as sent." }, { status: 409 });
      }
      next = "sent";
    } else if (action === "cancel") {
      if (!["draft", "issued", "sent"].includes(inv.status)) {
        return NextResponse.json({ error: "This invoice can't be cancelled any more." }, { status: 409 });
      }
      if (Number(inv.settled) > 0) {
        return NextResponse.json(
          { error: "Money has been received against this invoice, so it can't be cancelled. Write off the balance instead." },
          { status: 409 },
        );
      }
      next = "cancelled";
    } else {
      const open = (OPEN_STATUSES as readonly string[]).includes(inv.status);
      if (!open || Number(inv.total_amount) - Number(inv.settled) <= 0.01) {
        return NextResponse.json({ error: "Only an invoice with a balance still owed can be written off." }, { status: 409 });
      }
      next = "written_off";
    }

    await query(`UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1`, [id, next]);
    await createAuditLog({
      action: "status_change",
      entity_type: "invoice",
      entity_id: id,
      field_changes: { status: { before: inv.status, after: next } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ id, status: next });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("PATCH /api/invoices/:id error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
