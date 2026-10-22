/**
 * Your own two-step sign-in.
 *   GET   status: { enabled, enrolled_at, required, must_enrol }
 *   POST  { action: "setup" }                      start: returns the key to put in the authenticator app
 *   POST  { action: "enable", code }               confirm the first code; returns recovery codes (shown once)
 *   POST  { action: "disable", password, code }    switch off (refused while it is required for your role)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import {
  MFA_ROLES,
  beginEnrolment,
  checkSignInCode,
  finishEnrolment,
  getMfaRow,
  isMfaRequired,
  switchOff,
} from "@/lib/mfa";
import { EncryptionKeyMissingError } from "@/lib/field-crypto";

async function context(req: NextRequest) {
  const user = await requireUser(req);
  const [role, required, row] = await Promise.all([getUserRoleName(user.id), isMfaRequired(), getMfaRow(user.id)]);
  const roleNeeds = !!role && MFA_ROLES.includes(role);
  return { user, role, required, roleNeeds, row };
}

export async function GET(req: NextRequest) {
  try {
    const c = await context(req);
    return NextResponse.json({
      enabled: !!c.row?.mfa_enabled,
      enrolled_at: c.row?.mfa_enrolled_at ?? null,
      required: c.required && c.roleNeeds,
      role_can_use: c.roleNeeds,
      must_enrol: c.required && c.roleNeeds && !c.row?.mfa_enabled,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load your sign-in security." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await context(req);
    const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; password?: string };
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const ua = req.headers.get("user-agent");

    if (body.action === "setup") {
      if (c.row?.mfa_enabled) {
        return NextResponse.json({ error: "Two-step sign-in is already on. Switch it off first to set it up again." }, { status: 409 });
      }
      const account = c.user.email ?? c.user.id;
      const s = await beginEnrolment(c.user.id, account);
      return NextResponse.json({ secret: s.secret, uri: s.uri });
    }

    if (body.action === "enable") {
      const codes = await finishEnrolment(c.user.id, String(body.code ?? ""));
      if (!codes) {
        return NextResponse.json(
          { error: "That code didn't match. Check the code in your app (it changes every 30 seconds) and try again." },
          { status: 422 },
        );
      }
      await createAuditLog({
        action: "mfa_enabled",
        entity_type: "user",
        entity_id: c.user.id,
        field_changes: { mfa: { before: "off", after: "on" } },
        user_id: c.user.id,
        ip_address: ip,
        user_agent: ua,
      });
      return NextResponse.json({ ok: true, recovery_codes: codes });
    }

    if (body.action === "disable") {
      if (c.required && c.roleNeeds) {
        return NextResponse.json(
          { error: "Two-step sign-in is required for your role, so it can't be switched off. The Managing Partner can reset it if you lose your phone." },
          { status: 403 },
        );
      }
      const pw = await query<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = $1`, [c.user.id]);
      const okPw = !!pw[0]?.password_hash && (await bcrypt.compare(String(body.password ?? ""), pw[0].password_hash));
      if (!okPw || !(await checkSignInCode(c.user.id, String(body.code ?? "")))) {
        return NextResponse.json({ error: "Your password or code was not right." }, { status: 422 });
      }
      await switchOff(c.user.id);
      await createAuditLog({
        action: "mfa_disabled",
        entity_type: "user",
        entity_id: c.user.id,
        field_changes: { mfa: { before: "on", after: "off" } },
        user_id: c.user.id,
        ip_address: ip,
        user_agent: ua,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err instanceof EncryptionKeyMissingError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("POST /api/mfa/me error:", err);
    return NextResponse.json({ error: "That didn't work. Please try again." }, { status: 500 });
  }
}
