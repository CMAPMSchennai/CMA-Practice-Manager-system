/**
 * GET /api/settings/automation — lead time for recurring engagements and the
 * escalation steps (Gap #49; FR-06, FR-67). PUT saves them. manage_settings only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import {
  getAutomationSettings,
  sanitizeAutomation,
  saveAutomationSettings,
} from "@/lib/app-settings";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_settings");
    return NextResponse.json(await getAutomationSettings());
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requirePermission(req, "manage_settings");
    const body = (await req.json().catch(() => ({}))) as {
      recurring_lead_days?: unknown;
      escalation_days?: unknown;
      reminder_days?: unknown;
      turnaround_target_days?: unknown;
      task_due_days?: unknown;
    };
    const before = await getAutomationSettings();
    const triple = (v: unknown): [number, number, number] | undefined =>
      Array.isArray(v) ? [Number(v[0]), Number(v[1]), Number(v[2])] : undefined;
    const requested = sanitizeAutomation({
      recurring_lead_days: Number(body.recurring_lead_days),
      escalation_days: triple(body.escalation_days) ?? before.escalation_days,
      reminder_days: triple(body.reminder_days) ?? before.reminder_days,
      turnaround_target_days:
        body.turnaround_target_days === undefined ? before.turnaround_target_days : Number(body.turnaround_target_days),
      task_due_days: body.task_due_days === undefined ? before.task_due_days : Number(body.task_due_days),
    });
    const saved = await saveAutomationSettings(requested);
    await createAuditLog({
      action: "update",
      entity_type: "reference_data",
      entity_id: user.id,
      field_changes: {
        automation: { before: JSON.stringify(before), after: JSON.stringify(saved) },
      },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json(saved);
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
