import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/statutory-due-dates/:id — get a single statutory due date
 * PATCH /api/statutory-due-dates/:id — update status, escalation_level, owner, etc.
 *
 * AC (US030-AC-3): PATCH with { status: 'filed', completed_at } → 200 with updated status
 *   Note: 'filed' is mapped to 'completed' (DB constraint allows: pending, in_progress, completed, overdue, not_applicable)
 */

// Map user-friendly status aliases to DB-valid statuses
const STATUS_ALIAS: Record<string, string> = {
  filed: "completed",
};

const VALID_STATUSES = ["pending", "in_progress", "completed", "overdue", "not_applicable"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(req, "view_compliance");
    const { id } = await params;

    const rows = await query<Record<string, unknown>>(
      `SELECT sd.id, sd.client_id, sd.rule_id, sd.obligation_name,
              sd.obligation_name AS compliance_name,
              sd.due_date, sd.period_label, sd.status,
              sd.escalation_level, sd.owner_id, sd.completed_at,
              sd.notes, sd.created_at, sd.updated_at,
              c.name AS client_name,
              scr.name AS rule_name,
              scr.statute, scr.form_or_return
       FROM statutory_due_dates sd
       LEFT JOIN clients c ON c.id = sd.client_id
       LEFT JOIN statutory_calendar_rules scr ON scr.id = sd.rule_id
       WHERE sd.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Statutory due date not found" }, { status: 404 });
    }

    return NextResponse.json({ statutory_due_date: rows[0] }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(req, "manage_compliance");
    const { id } = await params;

    const body = await req.json();
    const {
      status: rawStatus,
      escalation_level,
      owner_id,
      completed_at,
      notes,
    } = body as {
      status?: string;
      escalation_level?: number;
      owner_id?: string | null;
      completed_at?: string | null;
      notes?: string | null;
    };

    // Fetch existing record
    const existing = await query<{
      id: string;
      status: string;
      escalation_level: number;
      owner_id: string | null;
      completed_at: string | null;
      notes: string | null;
    }>(
      `SELECT id, status, escalation_level, owner_id, completed_at, notes
       FROM statutory_due_dates WHERE id = $1`,
      [id]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Statutory due date not found" }, { status: 404 });
    }
    const before = existing[0];

    // Build SET clause dynamically
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (rawStatus !== undefined) {
      // Resolve alias
      const resolvedStatus = STATUS_ALIAS[rawStatus] ?? rawStatus;
      if (!VALID_STATUSES.includes(resolvedStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")} (or 'filed' as alias for 'completed')` },
          { status: 422 }
        );
      }
      sets.push(`status = $${idx++}`);
      vals.push(resolvedStatus);
    }

    if (escalation_level !== undefined) {
      sets.push(`escalation_level = $${idx++}`);
      vals.push(escalation_level);
    }

    if (owner_id !== undefined) {
      sets.push(`owner_id = $${idx++}`);
      vals.push(owner_id);
    }

    if (completed_at !== undefined) {
      sets.push(`completed_at = $${idx++}`);
      vals.push(completed_at);
    }

    if (notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      vals.push(notes);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 422 });
    }

    sets.push(`updated_at = now()`);

    const updated = await query<Record<string, unknown>>(
      `UPDATE statutory_due_dates
       SET ${sets.join(", ")}
       WHERE id = $${idx++}
       RETURNING id, client_id, rule_id, obligation_name,
                 obligation_name AS compliance_name,
                 due_date, period_label, status,
                 escalation_level, owner_id, completed_at,
                 notes, created_at, updated_at`,
      [...vals, id]
    );

    if (updated.length === 0) {
      return NextResponse.json({ error: "Statutory due date not found" }, { status: 404 });
    }

    // Audit log
    const fieldChanges: Record<string, { before: unknown; after: unknown }> = {};
    if (rawStatus !== undefined) {
      fieldChanges.status = { before: before.status, after: updated[0].status };
    }
    if (escalation_level !== undefined) {
      fieldChanges.escalation_level = {
        before: before.escalation_level,
        after: updated[0].escalation_level,
      };
    }
    if (owner_id !== undefined) {
      fieldChanges.owner_id = { before: before.owner_id, after: updated[0].owner_id };
    }
    if (completed_at !== undefined) {
      fieldChanges.completed_at = {
        before: before.completed_at,
        after: updated[0].completed_at,
      };
    }

    await createAuditLog({
      action: "update_statutory_due_date",
      entity_type: "statutory_due_date",
      entity_id: id,
      field_changes: fieldChanges,
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ statutory_due_date: updated[0] }, { status: 200 });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
