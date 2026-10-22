/**
 * GET /api/dashboard/kpis?period=YYYY-MM
 * US025-AC-1: Returns { net_profit, revenue_billed, realisation_pct, closing_cash, team_utilisation }
 * US025-AC-3 (negative): 401 if unauthenticated
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  // Firm finances (profit, billing, cash) only for roles with Finance access —
  // §4: staff have no fee visibility. Others get task completion only.
  let showFinancials = false;
  try {
    const user = await requirePermission(req, "view_dashboard");
    showFinancials = await userHasPermission(user.id, "view_finance");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const period = sp.get("period"); // YYYY-MM

    if (!period) {
      return NextResponse.json(
        { error: "period (YYYY-MM) is required." },
        { status: 422 },
      );
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: "period must be in YYYY-MM format." },
        { status: 422 },
      );
    }

    const periodStart = `${period}-01`;

    // Team utilisation: completed tasks / total tasks with due_date in period
    const taskRows = await query<{ total: string; completed: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'completed')::text AS completed
         FROM task_instances
        WHERE due_date >= $1::date
          AND due_date < ($1::date + INTERVAL '1 month')`,
      [periodStart],
    );
    const totalTasks = Number(taskRows[0].total);
    const completedTasks = Number(taskRows[0].completed);
    const teamUtilisation =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    if (!showFinancials) {
      return NextResponse.json({
        period,
        net_profit: null,
        revenue_billed: null,
        realisation_pct: null,
        closing_cash: null,
        team_utilisation: teamUtilisation,
        financials_visible: false,
      });
    }

    // Revenue billed: sum of invoices issued this period
    const invoicedRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(total_amount), 0)::text AS total
         FROM invoices
        WHERE invoice_date >= $1::date
          AND invoice_date < ($1::date + INTERVAL '1 month')
          AND status NOT IN ('cancelled','written_off')`,
      [periodStart],
    );

    // Cash received this period (receipts)
    const receiptRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM receipts
        WHERE receipt_date >= $1::date
          AND receipt_date < ($1::date + INTERVAL '1 month')`,
      [periodStart],
    );

    // Total expenses this period
    const expenseRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM expenses
        WHERE expense_date >= $1::date
          AND expense_date < ($1::date + INTERVAL '1 month')`,
      [periodStart],
    );

    // Closing cash: opening balances + receipts received up to end of period - expenses up to end of period
    // Simplified: sum of all bank account opening balances + cumulative receipts - cumulative expenses up to period end
    const bankBalanceRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(opening_balance), 0)::text AS total
         FROM bank_accounts
        WHERE is_active = true`,
    );

    const cumulativeReceiptsRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM receipts
        WHERE receipt_date < ($1::date + INTERVAL '1 month')`,
      [periodStart],
    );

    const cumulativeExpensesRows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM expenses
        WHERE expense_date < ($1::date + INTERVAL '1 month')`,
      [periodStart],
    );

    const revenueBilled = Number(invoicedRows[0].total);
    const cashReceived = Number(receiptRows[0].total);
    const expenses = Number(expenseRows[0].total);
    const netProfit = cashReceived - expenses;

    const realisationPct =
      revenueBilled > 0
        ? Math.min(100, Math.round((cashReceived / revenueBilled) * 100))
        : 0;

    const openingBalance = Number(bankBalanceRows[0].total);
    const cumReceipts = Number(cumulativeReceiptsRows[0].total);
    const cumExpenses = Number(cumulativeExpensesRows[0].total);
    const closingCash = openingBalance + cumReceipts - cumExpenses;

    return NextResponse.json({
      period,
      net_profit: netProfit,
      revenue_billed: revenueBilled,
      realisation_pct: realisationPct,
      closing_cash: closingCash,
      team_utilisation: teamUtilisation,
      financials_visible: true,
    });
  } catch (err: unknown) {
    console.error("GET /api/dashboard/kpis error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
