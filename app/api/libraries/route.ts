/**
 * GET /api/libraries  every task library with its version, scope and use (FR-07 to FR-10)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { listLibraries } from "@/lib/library-store";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "view_tasks");
    return NextResponse.json({
      libraries: await listLibraries(),
      can_edit: ["managing_partner", "partner"].includes(user.roleName),
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/libraries error:", err);
    return NextResponse.json({ error: "The libraries could not be loaded." }, { status: 500 });
  }
}
