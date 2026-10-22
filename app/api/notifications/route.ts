/**
 * GET /api/notifications — list notifications for the current user
 *
 * AC: US004-AC-2 — GET ?recipient_id=me → 200 with array containing status, sent_at, read_at
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { maybeRunDocumentExpiry } from "@/lib/document-expiry";
import { maybeRunArticleshipAlerts } from "@/lib/articleship-alert";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // FR-64: document expiry alerts go out here, so they reach the bell without anyone opening a vault.
    await maybeRunDocumentExpiry();
    await maybeRunArticleshipAlerts();

    const url = req.nextUrl;
    const recipientParam = url.searchParams.get("recipient_id");

    // Everyone reads only their own notifications.
    if (recipientParam && recipientParam !== "me" && recipientParam !== session.id) {
      return NextResponse.json({ error: "You can only read your own notifications" }, { status: 403 });
    }
    const recipientId = session.id;

    const rows = await query<{
      id: string;
      channel: string;
      recipient_id: string;
      template: string;
      subject: string | null;
      body: string | null;
      data: unknown;
      status: string;
      sent_at: string | null;
      read_at: string | null;
      error: string | null;
      created_at: string;
    }>(
      `SELECT id, channel, recipient_id, template, subject, body, data,
              status, sent_at, read_at, error, created_at
         FROM notifications
        WHERE recipient_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [recipientId],
    );

    return NextResponse.json({ notifications: rows });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
