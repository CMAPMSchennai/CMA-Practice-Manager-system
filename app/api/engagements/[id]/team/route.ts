/**
 * Engagement team (FR-03, FR-08). The team is who is on the engagement; people
 * on it can see it (access scope). Managers, Partners, Admin and the Managing
 * Partner (create_tasks) maintain it.
 *
 *   GET    → { team, can_edit }
 *   POST   { user_id }  → adds a person (eligible staff only, FR-42)
 *   DELETE ?user_id=…   → removes a person who holds no open task here
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission, getUserRoleName } from "@/lib/rbac";
import { canSeeEngagement, getAccessScope } from "@/lib/access-scope";
import { checkAssigneeEligibility } from "@/lib/task-assignment";
import { createAuditLog } from "@/lib/audit";

const NOT_FOUND = { error: "Engagement not found" };

function engagementRole(roleName: string | null): string {
  if (roleName === "managing_partner" || roleName === "partner") return "partner";
  if (roleName === "manager") return "manager";
  if (roleName === "articled_clerk") return "articled_clerk";
  return "associate";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "view_tasks");
    const { id } = await params;
    if (!(await canSeeEngagement(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }
    const team = await query<Record<string, unknown>>(
      `SELECT et.id, et.user_id, et.role_in_engagement,
              COALESCE(NULLIF(trim(u.name), ''), u.email) AS user_name, u.email AS user_email,
              (SELECT COUNT(*)::int FROM task_instances ti
                WHERE ti.engagement_id = et.engagement_id
                  AND (ti.assigned_to = et.user_id OR ti.reviewer = et.user_id)
                  AND ti.status NOT IN ('completed','not_applicable')) AS open_tasks
         FROM engagement_team et
         JOIN users u ON u.id = et.user_id
        WHERE et.engagement_id = $1
        ORDER BY et.created_at`,
      [id],
    );
    return NextResponse.json({ team, can_edit: await userHasPermission(user.id, "create_tasks") });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "create_tasks");
    const { id } = await params;
    if (!(await canSeeEngagement(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }
    const body = (await req.json().catch(() => ({}))) as { user_id?: string };
    if (!body.user_id) {
      return NextResponse.json({ error: "Choose a person to add." }, { status: 422 });
    }
    const roleName = await getUserRoleName(body.user_id);
    // Staff who do the work must be onboarded (FR-42); reviewers/partners are not gated.
    if (roleName === "articled_clerk" || roleName === "paid_assistant") {
      const eligibility = await checkAssigneeEligibility(body.user_id);
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.code, message: eligibility.message }, { status: 422 });
      }
    }
    const rows = await query<{ id: string }>(
      `INSERT INTO engagement_team (engagement_id, user_id, role_in_engagement)
       VALUES ($1, $2, $3)
       ON CONFLICT (engagement_id, user_id) DO NOTHING
       RETURNING id`,
      [id, body.user_id, engagementRole(roleName)],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "That person is already on the team." }, { status: 409 });
    }
    await createAuditLog({
      action: "update",
      entity_type: "engagement",
      entity_id: id,
      field_changes: { team_member: { before: null, after: body.user_id } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ added: true }, { status: 201 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "create_tasks");
    const { id } = await params;
    if (!(await canSeeEngagement(await getAccessScope(user.id, user.roleName), id))) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }
    const userId = req.nextUrl.searchParams.get("user_id");
    if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 422 });

    const open = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM task_instances
        WHERE engagement_id = $1 AND (assigned_to = $2 OR reviewer = $2)
          AND status NOT IN ('completed','not_applicable')`,
      [id, userId],
    );
    if ((open[0]?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "HAS_OPEN_TASKS",
          message: `This person still holds ${open[0].n} open task(s) here. Reassign them first.`,
        },
        { status: 409 },
      );
    }
    const removed = await query<{ id: string }>(
      `DELETE FROM engagement_team WHERE engagement_id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    if (removed.length > 0) {
      await createAuditLog({
        action: "update",
        entity_type: "engagement",
        entity_id: id,
        field_changes: { team_member: { before: userId, after: null } },
        user_id: user.id,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }
    return NextResponse.json({ removed: removed.length > 0 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
