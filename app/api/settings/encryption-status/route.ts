/**
 * GET /api/settings/encryption-status — whether field-level encryption is
 * active (NFR), and if not, whether the key is missing or malformed. Never
 * returns the key. Requires manage_settings.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { encryptionKeyStatus } from "@/lib/field-crypto";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_settings");
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
  const status = encryptionKeyStatus();
  return NextResponse.json({
    configured: status.state === "active",
    state: status.state,
    length: status.length ?? null,
  });
}
