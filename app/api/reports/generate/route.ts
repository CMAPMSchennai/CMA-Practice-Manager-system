/**
 * Retired. Reports are now run with GET /api/reports/run and downloaded with
 * GET /api/reports/export. The old generator built its queries from raw filter
 * text and its download link led nowhere.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has moved. Use /api/reports/run and /api/reports/export." },
    { status: 410 },
  );
}
