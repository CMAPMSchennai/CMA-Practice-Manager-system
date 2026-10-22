/**
 * GET /api/reports/export?report=&from=&to=&...  (FR-80)
 * The same report as an Excel workbook. A PDF is made from the report screen
 * with the browser's Print, Save as PDF.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { chosenReport, rbacFailure, reportContext } from "@/lib/report-access";
import type { Column, Table } from "@/lib/reports";

function addTable(ws: ExcelJS.Worksheet, t: Table, startRow: number): number {
  let row = startRow;
  if (t.title) {
    ws.getRow(row).getCell(1).value = t.title;
    ws.getRow(row).font = { bold: true };
    row++;
  }
  const header = ws.getRow(row);
  t.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF4" } };
  });
  row++;
  for (const r of t.rows) {
    const line = ws.getRow(row);
    t.columns.forEach((c: Column, i) => {
      const v = r[c.key];
      const cell = line.getCell(i + 1);
      if (v === null || v === undefined || v === "") return;
      if (c.type === "money" || c.type === "number" || c.type === "percent") {
        const n = Number(v);
        cell.value = Number.isFinite(n) ? n : String(v);
        if (c.type === "money") cell.numFmt = "#,##0.00";
        if (c.type === "percent") cell.numFmt = '0.0"%"';
      } else if (c.type === "date") {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) cell.value = String(v);
        else {
          cell.value = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          cell.numFmt = "dd mmm yyyy";
        }
      } else {
        cell.value = String(v);
      }
    });
    row++;
  }
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await reportContext(req);
    const chosen = chosenReport(req, ctx);
    if ("response" in chosen) return chosen.response;
    const { def, filters } = chosen;
    const result = await def.run(filters, ctx);

    const wb = new ExcelJS.Workbook();
    wb.creator = "CMA Practice Manager";
    const ws = wb.addWorksheet(def.name.slice(0, 30));
    ws.getRow(1).getCell(1).value = def.name;
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.getRow(2).getCell(1).value = `${filters.from} to ${filters.to}`;
    let row = 4;
    row = addTable(ws, result, row);
    for (const note of result.notes ?? []) {
      row++;
      ws.getRow(row).getCell(1).value = note;
      ws.getRow(row).font = { italic: true, color: { argb: "FF666666" } };
    }
    ws.columns.forEach((col, i) => {
      const label = result.columns[i]?.label ?? "";
      col.width = Math.min(48, Math.max(12, label.length + 4));
    });
    for (const t of result.extra ?? []) {
      const sheet = wb.addWorksheet((t.title ?? "More").slice(0, 30));
      addTable(sheet, { ...t, title: undefined }, 1);
      sheet.columns.forEach((col) => (col.width = 24));
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${def.id}_${filters.from}_${filters.to}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const denied = rbacFailure(err);
    if (denied) return denied;
    console.error("GET /api/reports/export error:", err);
    return NextResponse.json({ error: "The report could not be exported." }, { status: 500 });
  }
}
