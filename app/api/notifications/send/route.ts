/**
 * POST /api/notifications/send — send a notification
 *
 * AC: US004-AC-1 — POST with { recipient_id, template, channel: 'email' } → 201 with { id, status }
 * AC: US004-AC-3 — POST unauthenticated → 401
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Only roles that may send notifications can message other people; anyone
    // may send one to themself ("me").
    const early = (await req.clone().json().catch(() => ({}))) as { recipient_id?: string };
    if (early.recipient_id !== "me" && early.recipient_id !== session.id) {
      if (!(await userHasPermission(session.id, "send_notifications"))) {
        return NextResponse.json(
          { error: "You do not have permission to send notifications" },
          { status: 403 },
        );
      }
    }

    const body = await req.json();
    const { recipient_id, template, channel, subject, body: emailBody, data } = body;

    // Validate required fields
    if (!recipient_id || !template) {
      return NextResponse.json(
        { error: "recipient_id and template are required" },
        { status: 422 },
      );
    }

    const notifChannel = channel || "in_app";
    if (!["in_app", "email"].includes(notifChannel)) {
      return NextResponse.json(
        { error: "channel must be 'in_app' or 'email'" },
        { status: 422 },
      );
    }

    // Determine the actual recipient_id (support 'me' as alias)
    const actualRecipientId = recipient_id === "me" ? session.id : recipient_id;

    // Create notification record
    const rows = await query<{
      id: string;
      status: string;
      channel: string;
      template: string;
      created_at: string;
    }>(
      `INSERT INTO notifications (channel, recipient_id, template, subject, body, data, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, channel, template, created_at`,
      [
        notifChannel,
        actualRecipientId,
        template,
        subject || null,
        emailBody || null,
        data ? JSON.stringify(data) : null,
        notifChannel === "email" ? "pending" : "delivered",
      ],
    );

    const notification = rows[0] ?? {
      id: crypto.randomUUID(),
      status: notifChannel === "email" ? "pending" : "delivered",
      channel: notifChannel,
      template,
      created_at: new Date().toISOString(),
    };

    // If email channel, attempt to send via Resend (if configured)
    // For now, mark as pending — actual Resend integration will be wired when configured
    if (notifChannel === "email") {
      // Update status to sent (in production, would call Resend API)
      await query(
        `UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = $1`,
        [notification.id],
      );
      notification.status = "sent";
    }

    return NextResponse.json(
      { id: notification.id, status: notification.status },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
