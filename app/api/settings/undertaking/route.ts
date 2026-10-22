/**
 * The confidentiality undertaking text (FR-39).
 *   GET  anyone who can create or edit employees: { text, is_placeholder }
 *   PUT  Managing Partner only: { text }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { getUserRoleName, userHasPermission, requireRole, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { getUndertakingText, saveUndertakingText } from "@/lib/undertaking";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const isMp = (await getUserRoleName(user.id)) === "managing_partner";
    const ok = (await userHasPermission(user.id, "create_employees")) || (await userHasPermission(user.id, "edit_employees"));
    if (!ok && !isMp) {
      return NextResponse.json({ error: "You do not have permission to view this." }, { status: 403 });
    }
    return NextResponse.json({ ...(await getUndertakingText()), can_edit: isMp });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load the undertaking text." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const mp = await requireRole(req, "managing_partner");
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 40) {
      return NextResponse.json({ error: "Enter the full undertaking text (at least a few sentences)." }, { status: 422 });
    }
    if (text.length > 20000) {
      return NextResponse.json({ error: "The text is too long." }, { status: 422 });
    }
    await saveUndertakingText(text);
    await createAuditLog({
      action: "undertaking_text_changed",
      entity_type: "reference_data",
      entity_id: mp.id,
      field_changes: { confidentiality_undertaking: { before: "previous text", after: `new text (${text.length} characters)` } },
      user_id: mp.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ error: "Could not save the text." }, { status: 500 });
  }
}
