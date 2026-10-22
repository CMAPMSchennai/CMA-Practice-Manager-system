/**
 * GET  /api/audit-logs — query audit logs (immutable, no POST allowed)
 * POST /api/audit-logs — 405 Method Not Allowed (immutable)
 *
 * AC: US003-AC-1 — POST → 405
 * AC: US003-AC-2 — GET with entity_type & entity_id → 200 with entries
 * AC: US003-AC-3 — GET unauthenticated → 401
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { queryAuditLogs } from "@/lib/audit";
import { userHasPermission } from "@/lib/rbac";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = req.nextUrl;
    const entity_type = url.searchParams.get("entity_type") ?? undefined;
    const entity_id = url.searchParams.get("entity_id") ?? undefined;
    const user_id = url.searchParams.get("user_id") ?? undefined;
    const action = url.searchParams.get("action") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    // Server-side access: the full audit trail needs view_audit_logs. Anyone
    // who can see a client may still read that one client's timeline.
    const canViewAudit = await userHasPermission(session.id, "view_audit_logs");
    if (!canViewAudit) {
      const isClientTimeline = entity_type === "clients" && !!entity_id && !user_id && !action;
      const allowed =
        isClientTimeline &&
        (await userHasPermission(session.id, "view_clients")) &&
        (await canSeeClient(await getAccessScope(session.id), entity_id!));
      if (!allowed) {
        return NextResponse.json(
          { error: "You do not have permission to view the audit log" },
          { status: 403 },
        );
      }
    }

    const entries = await queryAuditLogs({
      entity_type,
      entity_id,
      user_id,
      action,
      limit: Math.min(limit, 500),
      offset,
    });

    return NextResponse.json({ audit_logs: entries });
  } catch (err: unknown) {
    console.error(err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST is explicitly disallowed — audit logs are immutable and
 * can only be created via internal service calls.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are immutable and created internally only." },
    { status: 405 },
  );
}

/**
 * PUT is explicitly disallowed.
 */
export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are immutable." },
    { status: 405 },
  );
}

/**
 * DELETE is explicitly disallowed.
 */
export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are immutable." },
    { status: 405 },
  );
}

/**
 * PATCH is explicitly disallowed.
 */
export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed. Audit logs are immutable." },
    { status: 405 },
  );
}
