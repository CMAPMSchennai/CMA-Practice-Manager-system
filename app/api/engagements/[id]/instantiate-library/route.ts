import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { InstantiateError, instantiateLibraryOnEngagement } from "@/lib/instantiate-library";

/**
 * POST /api/engagements/:id/instantiate-library
 * One-action copy of the full task library hierarchy onto an engagement as task_instances.
 *
 * Body: { task_library_id: UUID }
 *
 * AC-1: 201 with { tasks_created: N }
 * AC-2: 409 if the engagement already has task instances (prevent double-instantiation)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(req, "create_tasks");

    const { id: engagementId } = await params;
    const body = await req.json();
    const { task_library_id } = body as { task_library_id?: string };

    if (!task_library_id) {
      return NextResponse.json(
        { error: "task_library_id is required" },
        { status: 422 }
      );
    }

    const result = await instantiateLibraryOnEngagement(engagementId, task_library_id);

    await createAuditLog({
      action: "instantiate_library",
      entity_type: "engagement",
      entity_id: engagementId,
      field_changes: {
        task_library_id: { before: null, after: task_library_id },
        tasks_created: { before: null, after: result.tasks_created },
      },
      user_id: user.id,
      ip_address:
        req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ tasks_created: result.tasks_created }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof InstantiateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
