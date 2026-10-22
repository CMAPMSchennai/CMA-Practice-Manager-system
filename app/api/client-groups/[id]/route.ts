/**
 * PATCH  /api/client-groups/:id   { name?, description?, add_client_ids?, remove_client_ids? }
 * DELETE /api/client-groups/:id   remove the group; its clients stay, ungrouped (FR-29)
 *
 * Needs edit_clients. Clients outside the user's scope are left alone.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { userHasPermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";

type Ctx = { params: Promise<{ id: string }> };

async function guard(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!(await userHasPermission(session.id, "edit_clients"))) {
    return { error: NextResponse.json({ error: "You do not have permission to manage client groups" }, { status: 403 }) };
  }
  return { session };
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const { id } = await ctx.params;

    const found = await query<{ name: string }>(`SELECT name FROM client_groups WHERE id = $1::uuid`, [id]);
    if (found.length === 0) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    const body = await req.json();
    const changes: Record<string, { before: unknown; after: unknown }> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 255);
      if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 422 });
      if (name !== found[0].name) {
        const dupe = await query<{ id: string }>(
          `SELECT id FROM client_groups WHERE lower(name) = lower($1) AND id <> $2::uuid`,
          [name, id],
        );
        if (dupe.length > 0) return NextResponse.json({ error: "A group with this name already exists." }, { status: 409 });
        await query(`UPDATE client_groups SET name = $1, updated_at = now() WHERE id = $2::uuid`, [name, id]);
        changes.name = { before: found[0].name, after: name };
      }
    }
    if (typeof body.description === "string") {
      await query(`UPDATE client_groups SET description = $1, updated_at = now() WHERE id = $2::uuid`, [
        body.description.trim() || null,
        id,
      ]);
    }

    const scope = await getAccessScope(g.session.id);
    const allowed = async (cid: string) => scope.mode === "all" || (await canSeeClient(scope, cid));
    let added = 0;
    let removed = 0;
    for (const cid of ids(body.add_client_ids)) {
      if (!(await allowed(cid))) continue;
      await query(`UPDATE clients SET group_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`, [id, cid]);
      added++;
    }
    for (const cid of ids(body.remove_client_ids)) {
      if (!(await allowed(cid))) continue;
      await query(`UPDATE clients SET group_id = NULL, updated_at = now() WHERE id = $1::uuid AND group_id = $2::uuid`, [cid, id]);
      removed++;
    }
    if (added || removed) changes.clients = { before: null, after: { added, removed } };

    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        action: "update_client_group",
        entity_type: "clients",
        entity_id: id,
        field_changes: changes,
        user_id: g.session.id,
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });
    }
    return NextResponse.json({ ok: true, added, removed });
  } catch (err: unknown) {
    console.error("PATCH /api/client-groups/[id] error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const { id } = await ctx.params;

    const found = await query<{ name: string }>(`SELECT name FROM client_groups WHERE id = $1::uuid`, [id]);
    if (found.length === 0) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    await query(`UPDATE clients SET group_id = NULL, updated_at = now() WHERE group_id = $1::uuid`, [id]);
    await query(`DELETE FROM client_groups WHERE id = $1::uuid`, [id]);

    await createAuditLog({
      action: "delete_client_group",
      entity_type: "clients",
      entity_id: id,
      field_changes: { deleted: { before: { name: found[0].name }, after: null } },
      user_id: g.session.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("DELETE /api/client-groups/[id] error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
