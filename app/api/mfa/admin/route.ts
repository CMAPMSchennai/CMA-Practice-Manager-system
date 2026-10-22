/**
 * Managing Partner controls for two-step sign-in.
 *   GET   { required, people: [{ id, name, role, enabled }] }
 *   POST  { action: "require", required: boolean }   turn the requirement for Partners and the Managing Partner on or off
 *   POST  { action: "reset", user_id }               switch off someone's two-step sign-in (lost phone); they enrol again
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireRole, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { MFA_ROLES, isMfaRequired, setMfaRequired, switchOff } from "@/lib/mfa";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "managing_partner");
    const people = await query<{ id: string; name: string; role: string; enabled: boolean }>(
      `SELECT u.id, COALESCE(NULLIF(trim(u.name), ''), u.email) AS name, r.name AS role, u.mfa_enabled AS enabled
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = ANY($1::text[]) AND u.is_active = true
        ORDER BY r.name, name`,
      [MFA_ROLES],
    );
    return NextResponse.json({ required: await isMfaRequired(), people });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ error: "Could not load the sign-in security settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const mp = await requireRole(req, "managing_partner");
    const body = (await req.json().catch(() => ({}))) as { action?: string; required?: boolean; user_id?: string };
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const ua = req.headers.get("user-agent");

    if (body.action === "require") {
      const before = await isMfaRequired();
      await setMfaRequired(body.required === true);
      await createAuditLog({
        action: "mfa_requirement_changed",
        entity_type: "reference_data",
        entity_id: mp.id,
        field_changes: { mfa_required: { before, after: body.required === true } },
        user_id: mp.id,
        ip_address: ip,
        user_agent: ua,
      });
      return NextResponse.json({ ok: true, required: body.required === true });
    }

    if (body.action === "reset") {
      if (!body.user_id) return NextResponse.json({ error: "Choose a person." }, { status: 422 });
      const who = await query<{ id: string }>(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [body.user_id]);
      if (who.length === 0) return NextResponse.json({ error: "Person not found." }, { status: 404 });
      await switchOff(body.user_id);
      await createAuditLog({
        action: "mfa_reset",
        entity_type: "user",
        entity_id: body.user_id,
        field_changes: { mfa: { before: "on", after: "reset by Managing Partner" } },
        user_id: mp.id,
        ip_address: ip,
        user_agent: ua,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("POST /api/mfa/admin error:", err);
    return NextResponse.json({ error: "That didn't work. Please try again." }, { status: 500 });
  }
}
