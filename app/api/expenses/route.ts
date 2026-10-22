import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth-helpers";

/* ------------------------------------------------------------------ */
/*  GET /api/expenses — list expenses (optionally filter)             */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_finance");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const entityId = sp.get("entity_id");
    const category = sp.get("category");
    const engagementId = sp.get("engagement_id");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (entityId) {
      conditions.push(`ex.entity_id = $${idx++}`);
      params.push(entityId);
    }
    if (category) {
      conditions.push(`ex.category = $${idx++}`);
      params.push(category);
    }
    if (engagementId) {
      conditions.push(`ex.linked_engagement_id = $${idx++}`);
      params.push(engagementId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT ex.*,
              e.name AS entity_name,
              eng.engagement_code
         FROM expenses ex
         LEFT JOIN entities e ON e.id = ex.entity_id
         LEFT JOIN engagements eng ON eng.id = ex.linked_engagement_id
        ${where}
        ORDER BY ex.expense_date DESC, ex.created_at DESC
        LIMIT 500`,
      params,
    );

    return NextResponse.json({ expenses: rows });
  } catch (err: unknown) {
    console.error("GET /api/expenses error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/expenses — create a new expense entry                   */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  let user: SessionUser & { roleName: string };
  try {
    user = await requirePermission(req, "create_expenses");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = await req.json();
    const {
      entity_id,
      expense_date,
      category,
      description,
      amount,
      gst_amount,
      paid_from_account,
      linked_engagement_id,
      vendor_name,
      payment_reference,
    } = body;

    // ---- Validation ----
    if (!entity_id || !expense_date || !category || amount == null) {
      return NextResponse.json(
        { error: "entity_id, expense_date, category, and amount are required." },
        { status: 422 },
      );
    }

    const expenseAmount = Number(amount);
    if (isNaN(expenseAmount) || expenseAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number." },
        { status: 422 },
      );
    }

    // Validate entity exists
    const entityRows = await query<{ id: string }>(
      `SELECT id FROM entities WHERE id = $1 LIMIT 1`,
      [entity_id],
    );
    if (entityRows.length === 0) {
      return NextResponse.json({ error: "Entity not found." }, { status: 422 });
    }

    // Validate bank account if provided
    if (paid_from_account) {
      const bankRows = await query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM bank_accounts WHERE id = $1 LIMIT 1`,
        [paid_from_account],
      );
      if (bankRows.length === 0) {
        return NextResponse.json({ error: "Bank account not found." }, { status: 422 });
      }
      if (bankRows[0].entity_id !== entity_id) {
        return NextResponse.json(
          { error: "Bank account does not belong to the specified entity." },
          { status: 422 },
        );
      }
    }

    // Validate linked engagement if provided
    if (linked_engagement_id) {
      const engRows = await query<{ id: string }>(
        `SELECT id FROM engagements WHERE id = $1 LIMIT 1`,
        [linked_engagement_id],
      );
      if (engRows.length === 0) {
        return NextResponse.json({ error: "Linked engagement not found." }, { status: 422 });
      }
    }

    // ---- Insert ----
    const rows = await query<Record<string, unknown>>(
      `INSERT INTO expenses (
         entity_id, expense_date, category, description, amount, gst_amount,
         paid_from_account, linked_engagement_id, vendor_name, payment_reference, recorded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        entity_id,
        expense_date,
        category,
        description || null,
        expenseAmount,
        gst_amount != null ? Number(gst_amount) : null,
        paid_from_account || null,
        linked_engagement_id || null,
        vendor_name || null,
        payment_reference || null,
        user.id,
      ],
    );

    const expense = rows[0];

    // Audit log
    await createAuditLog({
      action: "create_expense",
      entity_type: "expense",
      entity_id: expense.id as string,
      field_changes: { created: { before: null, after: category } },
      user_id: user.id,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/expenses error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
