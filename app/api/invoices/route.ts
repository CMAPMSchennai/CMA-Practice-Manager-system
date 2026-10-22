import { NextRequest, NextResponse } from "next/server";
import { query, pool } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth-helpers";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import {
  REIMBURSEMENT_HEADS,
  computeTotals,
  isValidRate,
  nextInvoiceNumber,
  round2,
  isGstType,
  type FeeLine,
  type ReimbursementLine,
} from "@/lib/invoice-calc";
import { getGstRateSettings } from "@/lib/gst-rates";
import { SETTLED_SQL, daysOverdue, markOverdueInvoices } from "@/lib/invoice-status";

/* ------------------------------------------------------------------ */
/*  GET /api/invoices — invoice register (FR-70)                      */
/*  Each row carries its engagements, GST, what is still owed and the  */
/*  days overdue.                                                      */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let viewerId = "";
  try {
    const viewer = await requirePermission(req, "view_billing");
    viewerId = viewer.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    await markOverdueInvoices();

    const sp = req.nextUrl.searchParams;
    const billingEntityId = sp.get("billing_entity_id");
    const clientId = sp.get("client_id");
    const status = sp.get("status");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (billingEntityId) {
      conditions.push(`i.billing_entity_id = $${idx++}`);
      params.push(billingEntityId);
    }
    if (clientId) {
      conditions.push(`i.client_id = $${idx++}`);
      params.push(clientId);
    }
    if (status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT i.*,
              e.name AS billing_entity_name,
              c.name AS client_name,
              to_char(i.due_date, 'YYYY-MM-DD') AS due_date_s,
              (SELECT string_agg(en.engagement_code, ', ' ORDER BY en.engagement_code)
                 FROM invoice_engagements ie
                 JOIN engagements en ON en.id = ie.engagement_id
                WHERE ie.invoice_id = i.id) AS engagement_codes,
              ${SETTLED_SQL} AS settled
         FROM invoices i
         LEFT JOIN entities e ON e.id = i.billing_entity_id
         LEFT JOIN clients c ON c.id = i.client_id
        ${where}
        ORDER BY i.invoice_date DESC, i.created_at DESC
        LIMIT 500`,
      params,
    );

    const invoices = rows.map((r) => {
      const total = Number(r.total_amount) || 0;
      const settled = Number(r.settled) || 0;
      const outstanding = round2(Math.max(0, total - settled));
      const gst = round2((Number(r.cgst) || 0) + (Number(r.sgst) || 0) + (Number(r.igst) || 0));
      return {
        ...r,
        gst_total: gst,
        outstanding,
        days_overdue: daysOverdue(
          (r.due_date_s as string | null) ?? null,
          String(r.status),
          outstanding,
        ),
      };
    });

    const [canIssue, canCancel, canRecord] = await Promise.all([
      userHasPermission(viewerId, "create_invoices"),
      userHasPermission(viewerId, "edit_invoices"),
      userHasPermission(viewerId, "record_receipts"),
    ]);

    return NextResponse.json({
      invoices,
      can_issue: canIssue,
      can_cancel: canCancel,
      can_record: canRecord,
    });
  } catch (err: unknown) {
    console.error("GET /api/invoices error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/invoices — raise an invoice from one or more engagements */
/*  Created as a Draft; issuing is a separate step.                    */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let user: SessionUser & { roleName: string };
  try {
    user = await requirePermission(req, "create_invoices");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = await req.json();
    const {
      billing_entity_id,
      client_id,
      invoice_date,
      due_date,
      line_items,
      reimbursement_lines,
      engagements, // [{ engagement_id, amount }]
      notes,
      place_of_supply, // state code, for the CGST/SGST or IGST split
    } = body;

    if (!billing_entity_id || !client_id || !invoice_date || !line_items) {
      return NextResponse.json(
        { error: "billing_entity_id, client_id, invoice_date, and line_items are required." },
        { status: 422 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice_date))) {
      return NextResponse.json({ error: "Enter the invoice date as a valid date." }, { status: 422 });
    }
    if (!Array.isArray(line_items) || line_items.length === 0) {
      return NextResponse.json({ error: "line_items must be a non-empty array." }, { status: 422 });
    }
    if (!Array.isArray(engagements) || engagements.length === 0) {
      return NextResponse.json({ error: "At least one engagement must be linked." }, { status: 422 });
    }

    // Fee lines: amounts and a GST rate from the allowed list (Gap #52).
    const fees: FeeLine[] = [];
    const gstSettings = await getGstRateSettings();
    for (const raw of line_items as Record<string, unknown>[]) {
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "Every fee line needs an amount of 0 or more." }, { status: 422 });
      }
      const rate = raw.gst_rate === undefined || raw.gst_rate === null || raw.gst_rate === "" ? gstSettings.default_rate : Number(raw.gst_rate);
      if (!isValidRate(rate) || !gstSettings.rates.includes(rate)) {
        return NextResponse.json(
          { error: `GST rate must be one of: ${gstSettings.rates.map((r) => `${r}%`).join(", ")}. The list is kept in Settings > GST rates.` },
          { status: 422 },
        );
      }
      fees.push({
        description: String(raw.description ?? "").trim(),
        sac_code: raw.sac_code ? String(raw.sac_code) : undefined,
        amount,
        gst_rate: rate,
      });
    }

    // Reimbursements are billed separately, each under one of the five heads (FR-72).
    const reimbursements: ReimbursementLine[] = [];
    if (Array.isArray(reimbursement_lines)) {
      for (const raw of reimbursement_lines as Record<string, unknown>[]) {
        const amount = Number(raw.amount);
        const head = String(raw.head ?? "");
        if (!(REIMBURSEMENT_HEADS as readonly string[]).includes(head)) {
          return NextResponse.json(
            { error: `Choose a reimbursement head: ${REIMBURSEMENT_HEADS.join(", ")}.` },
            { status: 422 },
          );
        }
        if (!Number.isFinite(amount) || amount < 0) {
          return NextResponse.json({ error: "Every reimbursement needs an amount of 0 or more." }, { status: 422 });
        }
        reimbursements.push({ head, description: String(raw.description ?? "").trim(), amount });
      }
    }

    const entityRows = await query<{ id: string; gstin: string | null; short_code: string }>(
      `SELECT id, gstin, short_code FROM entities WHERE id = $1 LIMIT 1`,
      [billing_entity_id],
    );
    if (entityRows.length === 0) {
      return NextResponse.json({ error: "Billing entity not found." }, { status: 422 });
    }
    const billingEntity = entityRows[0];

    // Every linked engagement must belong to this client and this billing entity.
    const engagementIds = (engagements as { engagement_id: string }[]).map((e) => e.engagement_id);
    const engagementRows = await query<{
      id: string;
      engagement_code: string;
      billing_entity_id: string;
      client_id: string;
      status: string;
    }>(
      `SELECT id, engagement_code, billing_entity_id, client_id, status
         FROM engagements WHERE id = ANY($1::uuid[])`,
      [engagementIds],
    );
    if (engagementRows.length !== new Set(engagementIds).size) {
      return NextResponse.json({ error: "One or more engagement IDs are invalid." }, { status: 422 });
    }
    for (const eng of engagementRows) {
      if (eng.client_id !== client_id) {
        return NextResponse.json(
          { error: `Engagement ${eng.engagement_code} belongs to a different client.` },
          { status: 422 },
        );
      }
      if (eng.billing_entity_id !== billing_entity_id) {
        return NextResponse.json(
          { error: `Engagement ${eng.engagement_code} is billed from a different entity.` },
          { status: 422 },
        );
      }
      if (eng.status === "cancelled") {
        return NextResponse.json(
          { error: `Engagement ${eng.engagement_code} is cancelled and can't be invoiced.` },
          { status: 422 },
        );
      }
    }

    // The person may choose IGST or CGST + SGST on the form. Without a choice, the place of supply decides.
    const placeOfSupplyCode = typeof place_of_supply === "string" && place_of_supply ? place_of_supply : null;
    const chosenGst = isGstType(body.gst_type) ? body.gst_type : null;
    const suggested = computeTotals(fees, reimbursements, billingEntity.gstin, placeOfSupplyCode, null);
    const suggestedType = suggested.cgst > 0 ? "cgst_sgst" : "igst";
    const totals = computeTotals(fees, reimbursements, billingEntity.gstin, placeOfSupplyCode, chosenGst);
    const usedType = totals.cgst > 0 ? "cgst_sgst" : "igst";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const invoiceNumber = await nextInvoiceNumber(client, billing_entity_id, billingEntity.short_code, String(invoice_date));

      const insertResult = await client.query(
        `INSERT INTO invoices (
           invoice_number, billing_entity_id, client_id, invoice_date, due_date,
           line_items, reimbursement_lines, subtotal, cgst, sgst, igst,
           total_amount, amount_received, tds_receivable, status, issued_by, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          invoiceNumber,
          billing_entity_id,
          client_id,
          invoice_date,
          due_date || null,
          JSON.stringify(fees),
          reimbursements.length ? JSON.stringify(reimbursements) : null,
          totals.subtotal,
          totals.cgst,
          totals.sgst,
          totals.igst,
          totals.total,
          0, // amount_received
          Number(body.tds_receivable) || 0, // TDS the client is expected to deduct
          "draft",
          user.id,
          notes || null,
        ],
      );
      const invoice = insertResult.rows[0];

      for (const eng of engagements as Array<{ engagement_id: string; amount?: number }>) {
        await client.query(
          `INSERT INTO invoice_engagements (invoice_id, engagement_id, amount) VALUES ($1, $2, $3)`,
          [invoice.id, eng.engagement_id, eng.amount ?? null],
        );
      }
      await client.query("COMMIT");

      await createAuditLog({
        action: "create_invoice",
        entity_type: "invoice",
        entity_id: invoice.id,
        field_changes: {
          created: { before: null, after: invoiceNumber },
          // When the person chose a GST type other than the one the place of supply suggests, that is recorded.
          ...(chosenGst && usedType !== suggestedType ? { gst_type_override: { before: suggestedType, after: usedType } } : {}),
        },
        user_id: user.id,
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

      return NextResponse.json(
        {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          billing_entity_id: invoice.billing_entity_id,
          client_id: invoice.client_id,
          subtotal: Number(invoice.subtotal),
          cgst: Number(invoice.cgst),
          sgst: Number(invoice.sgst),
          igst: Number(invoice.igst),
          total_amount: Number(invoice.total_amount),
          amount_received: Number(invoice.amount_received),
          status: invoice.status,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          created_at: invoice.created_at,
        },
        { status: 201 },
      );
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("POST /api/invoices error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
