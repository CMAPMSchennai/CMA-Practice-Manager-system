/**
 * GET   /api/settings/visibility   the visibility switches and whether the caller may change them
 * PATCH /api/settings/visibility   { managers_see_standard_fees: boolean }  (Managing Partner and Admin)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getUserRoleName } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { getVisibilitySettings, saveVisibilitySettings } from "@/lib/visibility-settings";

const CAN_CHANGE = ["managing_partner", "admin"];

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const role = await getUserRoleName(session.id);
    const { settings } = await getVisibilitySettings();
    return NextResponse.json({ settings, can_edit: !!role && CAN_CHANGE.includes(role) });
  } catch (err: unknown) {
    console.error("GET /api/settings/visibility error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const role = await getUserRoleName(session.id);
    if (!role || !CAN_CHANGE.includes(role)) {
      return NextResponse.json({ error: "Only the Managing Partner or Admin can change this." }, { status: 403 });
    }
    const body = await req.json();
    if (typeof body.managers_see_standard_fees !== "boolean") {
      return NextResponse.json({ error: "Choose on or off." }, { status: 422 });
    }
    const before = (await getVisibilitySettings()).settings;
    const rowId = await saveVisibilitySettings({ managers_see_standard_fees: body.managers_see_standard_fees });
    await createAuditLog({
      action: "update",
      entity_type: "reference_data",
      entity_id: rowId,
      field_changes: {
        managers_see_standard_fees: { before: before.managers_see_standard_fees, after: body.managers_see_standard_fees },
      },
      user_id: session.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });
    return NextResponse.json({ settings: { managers_see_standard_fees: body.managers_see_standard_fees } });
  } catch (err: unknown) {
    console.error("PATCH /api/settings/visibility error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
