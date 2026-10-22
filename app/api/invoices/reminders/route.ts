/**
 * GET  /api/invoices/reminders          → drafted reminders (view_billing)
 * POST /api/invoices/reminders { id, action }
 *        approve | dismiss   Managing Partner or Partner (the partner-approval step, FR-74)
 *        mark_sent           Managing Partner, Partner or Admin, after sending an approved reminder
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { decideReminder, listReminders, syncReminders } from "@/lib/invoice-reminders";

const PARTNERS = ["managing_partner", "partner"];

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_billing");
    await syncReminders();
    return NextResponse.json({
      reminders: await listReminders(),
      can_approve: PARTNERS.includes(user.roleName),
      can_mark_sent: [...PARTNERS, "admin"].includes(user.roleName),
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/invoices/reminders error:", err);
    return NextResponse.json({ error: "Reminders couldn't be loaded." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_billing");
    const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
    const map: Record<string, "approved" | "dismissed" | "sent"> = {
      approve: "approved",
      dismiss: "dismissed",
      mark_sent: "sent",
    };
    const next = body.action ? map[body.action] : undefined;
    if (!body.id || !next) {
      return NextResponse.json({ error: "id and a valid action are required." }, { status: 422 });
    }
    const allowed = next === "sent" ? [...PARTNERS, "admin"] : PARTNERS;
    if (!allowed.includes(user.roleName)) {
      return NextResponse.json(
        {
          error:
            next === "sent"
              ? "Only the Managing Partner, a Partner or Admin can mark a reminder as sent."
              : "A Partner or the Managing Partner has to approve reminders before they go to a client.",
        },
        { status: 403 },
      );
    }
    const result = await decideReminder(body.id, next, user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await createAuditLog({
      action: "status_change",
      entity_type: "reference_data",
      entity_id: body.id,
      field_changes: { reminder: { before: null, after: next } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("POST /api/invoices/reminders error:", err);
    return NextResponse.json({ error: "That didn't work. Please try again." }, { status: 500 });
  }
}
