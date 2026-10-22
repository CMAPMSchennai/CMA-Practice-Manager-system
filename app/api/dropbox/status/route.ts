import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { handleIntegrationAction } from "@/lib/integrations/connectors/handleIntegrationAction";

/**
 * GET /api/integrations/dropbox/status  (served from /api/dropbox/status)
 *
 * Returns Dropbox connection status and storage usage for the integration widget.
 * Restricted to roles with manage_settings permission (admin, managing_partner).
 * Partner and below → 403. Unauthenticated → 401.
 *
 * US032 acceptance checks:
 *   AC-1: admin → 200 { connected: true, storage_used_bytes, storage_quota_bytes }
 *   AC-2: partner role → 403
 *   AC-3: no session → 401
 */
export async function GET(req: NextRequest) {
  // Only admin-level roles (manage_settings) may view integration status.
  // partner role does NOT have manage_settings → 403.
  try {
    await requirePermission(req, "manage_settings");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    // Call Dropbox via platform integration connector to get space usage.
    // Uses handleIntegrationAction (server-side) — credentials come from the
    // platform-managed sandbox env, never hardcoded.
    const result = await handleIntegrationAction(
      "dropbox",
      "usersgetspaceusage",
      { body: null },
    );

    if (!result.success) {
      // The storage figure needs the account_info.read permission, which this connection may
      // not carry. Try a plain folder listing (files.metadata.read) before calling it disconnected.
      const probe = await handleIntegrationAction(
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
      if (probe.success) {
        return NextResponse.json({
          connected: true,
          storage_used_bytes: null,
          storage_quota_bytes: null,
          message: "Connected. The storage figure is not available with the permissions granted.",
        });
      }
      // Dropbox not yet connected or call failed — return connected: false.
      return NextResponse.json({
        connected: false,
        storage_used_bytes: null,
        storage_quota_bytes: null,
        message:
          (result.error ?? "Dropbox is not connected. Connect it under Workbench → Configure → Integrations.") +
          ` [folder listing: ${probe.error ?? "no answer"}]`,
      });
    }

    // Dropbox space_usage response shape:
    // { used: number, allocation: { '.tag': 'individual'|'team', allocated: number, ... } }
    const data = result.data as {
      used?: number;
      allocation?: {
        allocated?: number;
        individual?: { allocated?: number };
        team?: { allocated?: number };
      };
    } | null;

    const storage_used_bytes = typeof data?.used === "number" ? data.used : null;

    let storage_quota_bytes: number | null = null;
    if (typeof data?.allocation?.allocated === "number") {
      storage_quota_bytes = data.allocation.allocated;
    } else if (typeof data?.allocation?.individual?.allocated === "number") {
      storage_quota_bytes = data.allocation.individual.allocated;
    } else if (typeof data?.allocation?.team?.allocated === "number") {
      storage_quota_bytes = data.allocation.team.allocated;
    }

    return NextResponse.json({
      connected: true,
      storage_used_bytes,
      storage_quota_bytes,
    });
  } catch (err: unknown) {
    console.error("GET /api/dropbox/status error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
