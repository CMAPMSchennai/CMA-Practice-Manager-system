import { NextRequest, NextResponse } from "next/server";
import { query, pool } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth-helpers";

/* ------------------------------------------------------------------ */
/*  GET /api/receipts — list receipts (optionally filter)             */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_billing");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const invoiceId = sp.get("invoice_id");
    const clientId = sp.get("client_id");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (invoiceId) {
      conditions.push(`r.invoice_id = $${idx++}`);
      params.push(invoiceId);
    }
    if (clientId) {
      conditions.push(`r.client_id = $${idx++}`);
      params.push(clientId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query<Record<string, unknown>>(
      `SELECT r.*,
              i.invoice_number,
              c.name AS client_name
         FROM receipts r
         LEFT JOIN invoices i ON i.id = r.invoice_id
         LEFT JOIN clients c ON c.id = r.client_id
        ${where}
        ORDER BY r.receipt_date DESC, r.created_at DESC
        LIMIT 500`,
      params,
    );

    return NextResponse.json({ receipts: rows });
  } catch (err: unknown) {
    console.error("GET /api/receipts error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/receipts — record a receipt (partial/full payment)      */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  let user: SessionUser & { roleName: string };
  try {
    user = await requirePermission(req, "record_receipts");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = await req.json();
    const {
      invoice_id,
      client_id,
      receipt_date,
      amount,
      tds_amount,
      payment_mode,
      payment_reference,
      bank_account_id,
      notes,
    } = body;

    // ---- Validation ----
    if (!invoice_id || !client_id || !receipt_date || amount == null) {
      return NextResponse.json(
        { error: "invoice_id, client_id, receipt_date, and amount are required." },
        { status: 422 },
      );
    }

    const receiptAmount = Number(amount);
    if (isNaN(receiptAmount) || receiptAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number." },
        { status: 422 },
      );
    }

    // Validate invoice exists and belongs to this client
    const invoiceRows = await query<{
      id: string;
      client_id: string;
      total_amount: string;
      amount_received: string;
      tds_receivable: string | null;
      status: string;
    }>(
      `SELECT id, client_id, total_amount, amount_received, tds_receivable, status
         FROM invoices
        WHERE id = $1
        LIMIT 1`,
      [invoice_id],
    );

    if (invoiceRows.length === 0) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 422 });
    }

    const invoice = invoiceRows[0];
    if (invoice.client_id !== client_id) {
      return NextResponse.json(
        { error: "client_id does not match the invoice's client." },
        { status: 422 },
      );
    }

    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Issue the invoice before recording a payment against it." },
        { status: 422 },
      );
    }
    if (["cancelled", "written_off"].includes(invoice.status)) {
      return NextResponse.json(
        { error: `Cannot record receipt against a ${invoice.status} invoice.` },
        { status: 422 },
      );
    }

    // What is still owed counts both money received and TDS the client deducted (FR-73).
    const settledRows = await query<{ paid: string; tds: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS paid,
              COALESCE(SUM(COALESCE(tds_amount, 0)), 0)::text AS tds
         FROM receipts WHERE invoice_id = $1`,
      [invoice_id],
    );
    const paidSoFar = Number(settledRows[0].paid);
    const tdsSoFar = Number(settledRows[0].tds);

    const totalAmount = Number(invoice.total_amount);
    const tdsOnReceipt = Number(tds_amount) || 0;
    const effectivePayment = receiptAmount + tdsOnReceipt;
    const outstanding = Math.round((totalAmount - paidSoFar - tdsSoFar) * 100) / 100;

    if (effectivePayment > outstanding + 0.01) {
      return NextResponse.json(
        {
          error: `Payment (${receiptAmount} + TDS ${tdsOnReceipt} = ${effectivePayment}) exceeds the balance still owed (${outstanding}).`,
        },
        { status: 422 },
      );
    }

    // ---- Insert receipt + update invoice in a transaction ----
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const receiptResult = await client.query(
        `INSERT INTO receipts (
           invoice_id, client_id, receipt_date, amount, tds_amount,
           payment_mode, payment_reference, bank_account_id, recorded_by, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          invoice_id,
          client_id,
          receipt_date,
          receiptAmount,
          tdsOnReceipt || null,
          payment_mode || null,
          payment_reference || null,
          bank_account_id || null,
          user.id,
          notes || null,
        ],
      );

      const receipt = receiptResult.rows[0];

      // Money received so far; tds_receivable stays as the TDS the client was expected to deduct.
      const newAmountReceived = paidSoFar + receiptAmount;
      const newTotalCollected = newAmountReceived + tdsSoFar + tdsOnReceipt;

      // Determine new invoice status
      let newStatus = invoice.status;
      if (newTotalCollected >= totalAmount - 0.01) {
        newStatus = "paid";
      } else if (newTotalCollected > 0) {
        newStatus = "partially_paid";
      }

      await client.query(
        `UPDATE invoices
            SET amount_received = $1,
                status = $2,
                updated_at = now()
          WHERE id = $3`,
        [newAmountReceived, newStatus, invoice_id],
      );

      await client.query("COMMIT");

      // Audit log
      await createAuditLog({
        action: "record_receipt",
        entity_type: "receipt",
        entity_id: receipt.id,
        field_changes: {
          invoice_id: { before: null, after: invoice_id },
          amount: { before: null, after: receiptAmount },
          invoice_status: { before: invoice.status, after: newStatus },
        },
        user_id: user.id,
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

      return NextResponse.json(
        {
          receipt: {
            id: receipt.id,
            invoice_id: receipt.invoice_id,
            client_id: receipt.client_id,
            receipt_date: receipt.receipt_date,
            amount: Number(receipt.amount),
            tds_amount: Number(receipt.tds_amount) || 0,
            payment_mode: receipt.payment_mode,
            payment_reference: receipt.payment_reference,
            bank_account_id: receipt.bank_account_id,
            recorded_by: receipt.recorded_by,
            notes: receipt.notes,
            created_at: receipt.created_at,
          },
          invoice_status: newStatus,
          invoice_amount_received: newAmountReceived,
          invoice_total: totalAmount,
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
    console.error("POST /api/receipts error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
