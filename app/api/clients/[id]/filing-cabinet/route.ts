/**
 * GET /api/clients/:id/filing-cabinet
 * Everything filed for a client, as folders. Read-only; only clients the user
 * can already see (FR-03, NFR-07).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { canSeeClient, getAccessScope } from "@/lib/access-scope";
import { buildCabinet } from "@/lib/filing-cabinet";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "view_documents");
    const { id } = await params;
    const scope = await getAccessScope(user.id, user.roleName);
    if (!(await canSeeClient(scope, id))) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json(await buildCabinet(id));
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/clients/[id]/filing-cabinet error:", err);
    return NextResponse.json({ error: "The filing cabinet couldn't be loaded. Please try again." }, { status: 500 });
  }
}
