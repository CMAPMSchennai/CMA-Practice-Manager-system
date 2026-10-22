import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { handleIntegrationAction } from "@/lib/integrations/connectors/handleIntegrationAction";

/**
 * POST /api/dropbox/test-folder
 * One-off connection check for the Managing Partner / Admin: asks Dropbox to
 * create a folder called CMA-PMS-test and reports exactly what Dropbox said.
 * Creates nothing else and reads no client data.
 */
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_settings");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const result = await handleIntegrationAction(
      "dropbox",
      "filescreatefolder",
      { path: "/CMA-PMS-test", autorename: false },
      {
        method: "POST",
        endpoint: "/files/create_folder_v2",
        fields: [
          { key: "path", location: "body" },
          { key: "autorename", location: "body" },
        ],
      },
    );
    return NextResponse.json({
      ok: result.success,
      status: result.statusCode,
      dropbox: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error,
    });
  } catch (err: unknown) {
    console.error("POST /api/dropbox/test-folder error:", err);
    const message = err instanceof Error && err.message.trim() ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
