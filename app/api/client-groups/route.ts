/**
 * GET  /api/client-groups   every group with its member clients (FR-29)
 * POST /api/client-groups   { name, description?, client_ids? } create a group
 *
 * Needs edit_clients. Clients outside the user's scope are left out.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
}
interface MemberRow {
  id: string;
  name: string;
  client_code: string | null;
  group_id: string;
}

async function guard(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!(await userHasPermission(session.id, "edit_clients"))) {
    return { error: NextResponse.json({ error: "You do not have permission to manage client groups" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;

    const groups = await query<GroupRow>(`SELECT id, name, description FROM client_groups ORDER BY name`);
    const members = await query<MemberRow>(
      `SELECT c.id, c.name, c.client_code, c.group_id
         FROM clients c WHERE c.group_id IS NOT NULL ORDER BY c.name`,
    );
    const scope = await getAccessScope(g.session.id);
    const visible: MemberRow[] = [];
    for (const m of members) {
      if (scope.mode === "all" || (await canSeeClient(scope, m.id))) visible.push(m);
    }
    return NextResponse.json({
      groups: groups.map((gr) => ({
        ...gr,
        members: visible.filter((m) => m.group_id === gr.id).map(({ id, name, client_code }) => ({ id, name, client_code })),
      })),
    });
  } catch (err: unknown) {
    console.error("GET /api/client-groups error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 255) : "";
    if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 422 });
    const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
    const clientIds: string[] = Array.isArray(body.client_ids) ? body.client_ids.filter((x: unknown) => typeof x === "string") : [];

    const dupe = await query<{ id: string }>(`SELECT id FROM client_groups WHERE lower(name) = lower($1)`, [name]);
    if (dupe.length > 0) return NextResponse.json({ error: "A group with this name already exists." }, { status: 409 });

    const rows = await query<{ id: string }>(
      `INSERT INTO client_groups (name, description) VALUES ($1, $2) RETURNING id`,
      [name, description],
    );
    const id = rows[0].id;

    const scope = await getAccessScope(g.session.id);
    let added = 0;
    for (const cid of clientIds) {
      if (scope.mode !== "all" && !(await canSeeClient(scope, cid))) continue;
      await query(`UPDATE clients SET group_id = $1, updated_at = now() WHERE id = $2::uuid`, [id, cid]);
      added++;
    }

    await createAuditLog({
      action: "create_client_group",
      entity_type: "clients",
      entity_id: id,
      field_changes: { created: { before: null, after: { name, clients: added } } },
      user_id: g.session.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });
    return NextResponse.json({ id, name, clients_added: added }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/client-groups error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
