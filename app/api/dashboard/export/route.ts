/**
 * GET /api/dashboard/export?period=YYYY-MM — the whole dashboard for the month
 * as an Excel workbook (FR-24). A PDF is made from the dashboard page itself
 * with the browser's Save as PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requirePermission, handleRbacError, userHasPermission } from "@/lib/rbac";
import { getAccessScope } from "@/lib/access-scope";
import { buildOverview } from "@/lib/dashboard-overview";

const STATUS_WORDS: Record<string, string> = {
  ready: "Ready",
  review_needed: "Review needed",
  on_hold: "On hold",
};

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_dashboard");
    const period = req.nextUrl.searchParams.get("period");
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json({ error: "period must be in YYYY-MM format." }, { status: 422 });
    }
    const [finance, team, scope] = await Promise.all([
      userHasPermission(user.id, "view_finance"),
      userHasPermission(user.id, "view_payroll"),
      getAccessScope(user.id, user.roleName),
    ]);
    const o = await buildOverview(period, { finance, team, scope });

    const wb = new ExcelJS.Workbook();
    wb.creator = "CMA Practice Manager";
    const bold = { bold: true };

    const summary = wb.addWorksheet("Summary");
    summary.columns = [{ width: 38 }, { width: 22 }];
    summary.addRow([`Managing Partner dashboard, ${period}`]).font = { bold: true, size: 14 };
    summary.addRow([]);
    summary.addRow(["Team utilisation (tasks closed / due in month)", `${o.utilisation.pct}%`]);
    summary.addRow(["Tasks closed", o.utilisation.tasks_closed]);
    summary.addRow(["Tasks due in the month", o.utilisation.tasks_total]);
    summary.addRow(["Active staff", o.utilisation.staff_count]);
    if (o.finance) {
      const f = o.finance;
      summary.addRow([]);
      summary.addRow(["Income (invoiced, before GST)", f.income]);
      summary.addRow(["Expenses", f.expenses]);
      summary.addRow(["Net profit", f.net_profit]);
      summary.addRow(["Net profit, previous month", f.prev_net_profit]);
      summary.addRow(["Change on previous month (%)", f.mom_pct ?? "n/a"]);
      summary.addRow(["Margin (%)", f.margin_pct ?? "n/a"]);
      summary.addRow(["Revenue billed", f.income]);
      summary.addRow(["Collected in the month", f.collected]);
      summary.addRow(["Realisation (%)", f.realisation_pct ?? "n/a"]);
      summary.addRow(["Closing cash", f.cash.closing]);
      summary.addRow(["Net cash inflow", f.cash.net_inflow]);
      summary.addRow(["Receivables, total", f.receivables.total]);
      summary.addRow(["Receivables overdue more than 60 days", f.receivables.overdue_60]);

      const pl = wb.addWorksheet("P&L");
      pl.columns = [{ width: 36 }, { width: 18 }];
      pl.addRow(["Income by service line", "Amount"]).font = bold;
      for (const l of f.revenue_lines) pl.addRow([l.name, l.amount]);
      pl.addRow(["Total income", f.income]).font = bold;
      pl.addRow([]);
      pl.addRow(["Expenses by category", "Amount"]).font = bold;
      for (const l of f.expense_lines) pl.addRow([l.name, l.amount]);
      pl.addRow(["Total expenses", f.expenses]).font = bold;
      pl.addRow([]);
      pl.addRow(["Net profit", f.net_profit]).font = bold;

      const cash = wb.addWorksheet("Cash flow");
      cash.columns = [{ width: 30 }, { width: 18 }];
      cash.addRow(["Opening cash", f.cash.opening]);
      cash.addRow(["Collections", f.cash.collections]);
      cash.addRow(["Salaries paid", -f.cash.salaries]);
      cash.addRow(["Operating expenses", -f.cash.operating]);
      cash.addRow(["Statutory outflow", -f.cash.statutory]);
      cash.addRow(["Closing cash", f.cash.closing]).font = bold;
    }

    if (o.team) {
      const ws = wb.addWorksheet("Team");
      ws.columns = [{ width: 28 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];
      ws.addRow(["Employee", "Role", "Tasks done", "Tasks assigned", "Completion %", "Salary status"]).font = bold;
      for (const r of o.team.rows) {
        ws.addRow([r.name, r.role, r.tasks_done, r.tasks_assigned, r.completion_pct, STATUS_WORDS[r.salary_status]]);
      }
    }

    if (o.tasks_not_completed) {
      const ws = wb.addWorksheet("Tasks not completed");
      ws.columns = [
        { width: 46 },
        { width: 28 },
        { width: 26 },
        { width: 14 },
        { width: 10 },
        { width: 34 },
        { width: 22 },
        { width: 12 },
      ];
      ws.addRow(["Task", "Client", "Assignee", "Due date", "Days late", "Reason", "Partner action", "Blocks salary"]).font = bold;
      for (const t of o.tasks_not_completed.rows) {
        ws.addRow([
          t.title,
          t.client ?? "",
          t.assignee,
          t.due_date,
          t.days_late,
          t.reason ?? "No reason logged",
          t.partner_action ?? "",
          t.blocking ? "Yes" : "No",
        ]);
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dashboard-${period}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/dashboard/export error:", err);
    return NextResponse.json({ error: "The export couldn't be created. Please try again." }, { status: 500 });
  }
}
