/**
 * POST /api/email/test   { to }
 * Connection check for the Managing Partner / Admin: sends one plain test message
 * through the shared email sender and reports exactly what came back.
 * Reads no client data and creates no login. Remove before go-live.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations/email";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const role = await getUserRoleName(session.id);
    if (!role || !["managing_partner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Only the Managing Partner or Admin can send a test email." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { to?: unknown };
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to) return NextResponse.json({ error: "Type the email address to send the test to." }, { status: 422 });

    const result = await sendEmail({
      to,
      subject: "CMA Practice Manager test email",
      text: "This is a test message from the CMA Practice Manager. If you can read it, email sending works. No action is needed.",
      html: '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16233B"><p>This is a test message from the <strong>CMA Practice Manager</strong>.</p><p>If you can read it, email sending works. No action is needed.</p></div>',
    });

    try {
      await createAuditLog({
        action: result.ok ? "send_test_email" : "send_test_email_failed",
        entity_type: "setting",
        entity_id: session.id,
        field_changes: {
          sent_to: { before: null, after: to },
          ...(result.ok ? {} : { error: { before: null, after: result.error } }),
        },
        user_id: session.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    } catch (err) {
      console.error("[email-test] audit failed:", err);
    }

    return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
  } catch (err) {
    console.error("POST /api/email/test error:", err);
    return NextResponse.json({ ok: false, error: "The test could not be run." }, { status: 500 });
  }
}
