/**
 * GET   /api/settings/gst-rates   the allowed GST rates and the default (any signed-in user; the invoice form needs it)
 * PATCH /api/settings/gst-rates   { rates, default_rate }   change the list (Managing Partner or Admin)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { getGstRateSettings, normaliseSettings, saveGstRateSettings } from "@/lib/gst-rates";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const role = await getUserRoleName(session.id);
    const settings = await getGstRateSettings();
    return NextResponse.json({ ...settings, can_edit: !!role && ["managing_partner", "admin"].includes(role) });
  } catch (err) {
    console.error("GET /api/settings/gst-rates error:", err);
    return NextResponse.json({ error: "The GST rates couldn't be loaded." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const role = await getUserRoleName(session.id);
    if (!role || !["managing_partner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Only the Managing Partner or Admin can change the GST rates." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { rates?: unknown; default_rate?: unknown };
    const parsed = normaliseSettings(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

    const before = await getGstRateSettings();
    await saveGstRateSettings(parsed.value);
    await createAuditLog({
      action: "update_gst_rates",
      entity_type: "setting",
      entity_id: session.id,
      field_changes: {
        rates: { before: before.rates.join(", "), after: parsed.value.rates.join(", ") },
        default_rate: { before: before.default_rate, after: parsed.value.default_rate },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ...parsed.value, can_edit: true });
  } catch (err) {
    console.error("PATCH /api/settings/gst-rates error:", err);
    return NextResponse.json({ error: "The GST rates couldn't be saved." }, { status: 500 });
  }
}
