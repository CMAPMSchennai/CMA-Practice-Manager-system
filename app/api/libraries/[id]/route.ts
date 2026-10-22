/**
 * GET /api/libraries/:id  one library: its areas, sub-tasks and steps, version history and use
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { getHistory, getUsage, listLibraries, loadTree } from "@/lib/library-store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(req, "view_tasks");
    const { id } = await params;
    const all = await listLibraries();
    const library = all.find((l) => l.id === id);
    if (!library) return NextResponse.json({ error: "Library not found." }, { status: 404 });

    const [tree, history, usage, inherited] = await Promise.all([
      loadTree(id),
      getHistory(id),
      getUsage(id),
      library.base_id ? loadTree(library.base_id) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      library,
      inherited,
      variants: all.filter((l) => l.base_id === id).map((l) => ({ id: l.id, name: l.name, version: l.version })),
      tree,
      history,
      usage,
      can_edit: ["managing_partner", "partner"].includes(user.roleName),
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const { status, body } = handleRbacError(err);
      return NextResponse.json(body, { status });
    }
    console.error("GET /api/libraries/:id error:", err);
    return NextResponse.json({ error: "The library could not be loaded." }, { status: 500 });
  }
}
