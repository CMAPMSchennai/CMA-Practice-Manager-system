/**
 * Reads the firm's workbook ("CMA Workflow Automation.xlsx") for the FR-83
 * importer. Sheets are found by name and columns by header text, so columns
 * can be reordered or added (new columns become extra details, Gap #40).
 */
import ExcelJS from "exceljs";

export interface SheetRow {
  /** 1-based Excel row number, for the validation report. */
  row: number;
  /** Header text → cell value (already unwrapped from formulas / rich text). */
  values: Record<string, unknown>;
}

export interface SheetTable {
  name: string;
  headers: string[];
  rows: SheetRow[];
}

export function normaliseHeader(h: unknown): string {
  return String(h ?? "").replace(/\s+/g, " ").trim();
}

function unwrap(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return unwrap(o.result as ExcelJS.CellValue); // formula
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    }
    if ("text" in o) return o.text; // hyperlink
    if ("error" in o) return null;
    return null;
  }
  return v;
}

export async function loadWorkbook(data: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb;
}

/** Find a worksheet by exact name (the two "Client Master" sheets differ only by a trailing dot). */
export function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((ws) => ws.name === name);
}

/**
 * Read a sheet as rows keyed by header. `headerRow` is the row holding the
 * column names; fully empty rows are skipped.
 */
export function readTable(ws: ExcelJS.Worksheet, headerRow: number): SheetTable {
  const headerCells = ws.getRow(headerRow);
  const columns: { col: number; header: string }[] = [];
  headerCells.eachCell({ includeEmpty: false }, (cell, col) => {
    const header = normaliseHeader(unwrap(cell.value));
    if (header) columns.push({ col, header });
  });

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, unknown> = {};
    let any = false;
    for (const { col, header } of columns) {
      const v = unwrap(row.getCell(col).value);
      if (v !== null && v !== "" && !(typeof v === "string" && !v.trim())) any = true;
      values[header] = v;
    }
    if (any) rows.push({ row: r, values });
  }
  return { name: ws.name, headers: columns.map((c) => c.header), rows };
}

/* ------------------------------------------------------------------ */
/*  Value helpers                                                     */
/* ------------------------------------------------------------------ */

const NA_VALUES = /^(na|n\/a|n\.a\.?|not available|nil|none|-+)$/i;

/** Trimmed text, or null when empty. */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDate(v);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
}

/** §11.3: "NA", "Not available", "N/A" mean the value is still to be collected. */
export function isNotAvailable(v: unknown): boolean {
  const s = text(v);
  return s !== null && NA_VALUES.test(s);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dates may be real dates, Excel serial numbers (§11.3) or text such as
 * 31/03/2024, 31-03-2024 or 2024-03-31. Returns YYYY-MM-DD or null.
 */
export function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : isoDate(v);
  if (typeof v === "number" && v > 0 && v < 100000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    return isoDate(new Date(ms));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Numbers that may carry ₹, commas or spaces. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Digits only (phone, Aadhaar, account numbers stored as numbers in Excel). */
export function digitsText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = typeof v === "number" ? Math.round(v).toString() : String(v);
  const d = s.replace(/\D/g, "");
  return d ? d : null;
}
