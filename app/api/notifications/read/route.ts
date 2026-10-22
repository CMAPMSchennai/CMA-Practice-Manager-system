/**
 * POST /api/notifications/read — mark the signed-in user's notifications as read.
 * Body (optional): { id } for one notification; without it, all of them.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    const rows = body.id
      ? await query<{ id: string }>(
          `UPDATE notifications SET status = 'read', read_at = now(), updated_at = now()
            WHERE recipient_id = $1 AND id = $2 AND read_at IS NULL RETURNING id`,
          [session.id, body.id],
        )
      : await query<{ id: string }>(
          `UPDATE notifications SET status = 'read', read_at = now(), updated_at = now()
            WHERE recipient_id = $1 AND read_at IS NULL RETURNING id`,
          [session.id],
        );
    return NextResponse.json({ marked: rows.length });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
