/**
 * POST /api/migration/workbook — FR-83 workbook importer (MP and Admin, Gap #36).
 *
 * multipart/form-data:
 *   file       the firm's workbook (.xlsx)
 *   mode       "dry-run" (default) — report only, nothing saved
 *              "apply"   — import; changes to existing records only where approved
 *   approvals  (apply) JSON { updates: string[], duplicates: string[] }
 *
 * The file is re-read on apply, so what is imported is exactly what the dry run
 * reported for that file.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { isEncryptionConfigured } from "@/lib/field-crypto";
import { createAuditLog } from "@/lib/audit";
import { loadWorkbook } from "@/lib/workbook-import/read";
import { buildImportPlan, publicPlan } from "@/lib/workbook-import/plan";
import { applyPlan } from "@/lib/workbook-import/apply";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let actorId: string;
  try {
    const actor = await requirePermission(req, "manage_settings");
    actorId = actor.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "dry-run");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose the workbook (.xlsx) to upload" }, { status: 422 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only Excel workbooks (.xlsx) can be imported" }, { status: 422 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "The workbook is larger than 15 MB" }, { status: 422 });
    }

    let wb;
    try {
      wb = await loadWorkbook(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "This file couldn't be read as an Excel workbook" }, { status: 422 });
    }

    const plan = await buildImportPlan(wb);
    const encryption = isEncryptionConfigured();

    if (mode !== "apply") {
      return NextResponse.json({ file_name: file.name, encryption_active: encryption, plan: publicPlan(plan) });
    }

    if (plan.sheet_errors.length) {
      return NextResponse.json({ error: plan.sheet_errors.join("; ") }, { status: 422 });
    }
    if (!encryption) {
      return NextResponse.json(
        { error: "Encryption isn't active, so PAN, Aadhaar, bank and salary can't be saved. Import stopped." },
        { status: 503 },
      );
    }

    let approvals: { updates?: unknown; duplicates?: unknown } = {};
    try {
      approvals = JSON.parse(String(form.get("approvals") ?? "{}"));
    } catch {
      return NextResponse.json({ error: "Approvals couldn't be read" }, { status: 422 });
    }
    const toSet = (v: unknown) => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

    const result = await applyPlan(
      plan,
      { updates: toSet(approvals.updates), duplicates: toSet(approvals.duplicates) },
      actorId,
      file.name,
    );

    await createAuditLog({
      action: "create",
      entity_type: "reference_data",
      entity_id: result.batch_id,
      field_changes: { workbook_import: { before: null, after: { file: file.name, ...result.counts, errors: result.errors.length } } },
      user_id: actorId,
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/migration/workbook error:", err);
    return NextResponse.json({ error: "The import couldn't be completed. Please try again." }, { status: 500 });
  }
}
