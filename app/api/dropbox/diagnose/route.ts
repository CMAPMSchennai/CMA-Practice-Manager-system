import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { handleIntegrationAction } from "@/lib/integrations/connectors/handleIntegrationAction";

/**
 * POST /api/dropbox/diagnose
 * Managing Partner / Admin only. Reports what the running app holds for Dropbox
 * (present or not, and how long, never the values) and what Dropbox answers to a
 * folder listing and a space-usage call. Changes nothing.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_settings");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    let manifest: { generated_at?: string; configured?: boolean; hasOauth?: boolean } = {};
    try {
      const m = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "lib/integrations/connectors/manifest.json"), "utf8"),
      );
      const p = m.providers?.dropbox;
      manifest = { generated_at: m.generated_at, configured: !!p?.configured, hasOauth: !!p?.oauth };
    } catch {
      manifest = {};
    }

    const env = Object.entries(process.env)
      .filter(([k]) => k.startsWith("DROPBOX_"))
      .map(([k, v]) => `${k}: ${v ? `present (${v.length} characters)` : "empty"}`);

    const listing = await handleIntegrationAction(
      "dropbox",
      "fileslistfolder",
      { path: "", limit: 1 },
      {
        method: "POST",
        endpoint: "/files/list_folder",
        fields: [
          { key: "path", location: "body" },
          { key: "limit", location: "body" },
        ],
      },
    );
    const usage = await handleIntegrationAction("dropbox", "usersgetspaceusage", { body: null });

    const short = (r: { success: boolean; statusCode: number; error?: string }) => ({
      ok: r.success,
      status: r.statusCode,
      error: r.error ? String(r.error).slice(0, 400) : undefined,
    });
    return NextResponse.json({ manifest, env, listing: short(listing), usage: short(usage) });
  } catch (err: unknown) {
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
