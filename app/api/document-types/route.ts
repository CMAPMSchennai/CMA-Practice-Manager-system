/**
 * GET   /api/document-types   the document types and the category each belongs to
 * POST  /api/document-types   { label, category }   add a type (Managing Partner or Admin)
 * PATCH /api/document-types   { id, category?, is_active? }   move a type or switch it off / on
 *
 * A type's name is not editable: documents already uploaded remember the name, so renaming
 * would lose their category. Add a new type instead and switch the old one off.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName } from "@/lib/rbac";
import { query } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { isCategory } from "@/lib/document-categories";
import { documentTypeSlug, listDocumentTypes } from "@/lib/document-types-store";

async function managerOrNull(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const role = await getUserRoleName(session.id);
  if (!role || !["managing_partner", "admin"].includes(role)) {
    return { error: NextResponse.json({ error: "Only the Managing Partner or Admin can change document types." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const all = await listDocumentTypes();
    const role = await getUserRoleName(session.id);
    const canEdit = !!role && ["managing_partner", "admin"].includes(role);
    // Staff only need the active types; the people who manage the list see all of them.
    return NextResponse.json({ document_types: canEdit ? all : all.filter((t) => t.is_active), can_edit: canEdit });
  } catch (err) {
    console.error("GET /api/document-types error:", err);
    return NextResponse.json({ error: "The document types couldn't be loaded." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await managerOrNull(req);
    if (gate.error) return gate.error;
    const body = (await req.json().catch(() => ({}))) as { label?: string; category?: string };
    const label = (body.label ?? "").trim().slice(0, 100);
    if (!label) return NextResponse.json({ error: "Type a name for the document type." }, { status: 422 });
    if (!isCategory(body.category)) return NextResponse.json({ error: "Choose a category." }, { status: 422 });

    const existing = await listDocumentTypes();
    if (existing.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      return NextResponse.json({ error: "That document type already exists." }, { status: 409 });
    }
    const next = existing.reduce((m, t) => Math.max(m, t.sort_order), 0) + 10;
    const rows = await query<{ id: string }>(
      `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
       VALUES ('document_type', $1, $2, $3, true, $4) RETURNING id`,
      [`${documentTypeSlug(label) || "type"}_${next}`, label, next, JSON.stringify({ category: body.category })],
    );
    await createAuditLog({
      action: "create",
      entity_type: "document_type",
      entity_id: rows[0].id,
      field_changes: { document_type: { before: null, after: `${label} (${body.category})` } },
      user_id: gate.session!.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/document-types error:", err);
    return NextResponse.json({ error: "The document type couldn't be added." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gate = await managerOrNull(req);
    if (gate.error) return gate.error;
    const body = (await req.json().catch(() => ({}))) as { id?: string; category?: string; is_active?: boolean };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 422 });
    if (body.category !== undefined && !isCategory(body.category)) {
      return NextResponse.json({ error: "Choose one of the seven categories." }, { status: 422 });
    }

    const all = await listDocumentTypes();
    const current = all.find((t) => t.id === body.id);
    if (!current) return NextResponse.json({ error: "Document type not found." }, { status: 404 });

    const category = body.category ?? current.category;
    const active = body.is_active ?? current.is_active;
    await query(
      `UPDATE reference_data SET metadata = $2, is_active = $3, updated_at = now() WHERE id = $1 AND type = 'document_type'`,
      [body.id, JSON.stringify({ category }), active],
    );
    await createAuditLog({
      action: "update",
      entity_type: "document_type",
      entity_id: body.id,
      field_changes: {
        ...(category !== current.category ? { category: { before: current.category, after: category } } : {}),
        ...(active !== current.is_active ? { is_active: { before: current.is_active, after: active } } : {}),
      },
      user_id: gate.session!.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/document-types error:", err);
    return NextResponse.json({ error: "The document type couldn't be saved." }, { status: 500 });
  }
}
