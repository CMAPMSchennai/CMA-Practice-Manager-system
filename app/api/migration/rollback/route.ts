/**
 * POST /api/migration/rollback
 * US027-AC-2: Rollback a previously run migration batch
 * Body: { batch_id: string }
 * Returns: { rolled_back: N }
 * Role gate: manage_settings (managing_partner + admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const user = await requirePermission(req, "manage_settings");
    userId = user.id;
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }

  try {
    const body = await req.json();
    const { batch_id } = body as { batch_id?: string };

    if (!batch_id) {
      return NextResponse.json(
        { error: "batch_id is required." },
        { status: 422 },
      );
    }

    // Look up the audit log entry for this batch to find inserted IDs and entity_type
    const auditRows = await query<{
      id: string;
      field_changes: unknown;
    }>(
      `SELECT id, field_changes
         FROM audit_logs
        WHERE action = 'migration_run'
          AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [batch_id],
    );

    if (auditRows.length === 0) {
      return NextResponse.json(
        { error: `No migration batch found with id: ${batch_id}` },
        { status: 404 },
      );
    }

    const changes = auditRows[0].field_changes as {
      entity_type?: string;
      inserted_ids?: string[];
      dry_run?: boolean;
    };

    if (typeof changes === "string") {
      // Handle JSON stored as string
      try {
        const parsed = JSON.parse(changes) as {
          entity_type?: string;
          inserted_ids?: string[];
          dry_run?: boolean;
        };
        Object.assign(changes, parsed);
      } catch {
        return NextResponse.json(
          { error: "Could not parse batch metadata." },
          { status: 500 },
        );
      }
    }

    if (changes.dry_run === true) {
      return NextResponse.json(
        { error: "This batch was a dry run — nothing was inserted, nothing to rollback." },
        { status: 422 },
      );
    }

    const entityType = changes.entity_type ?? "unknown";
    const insertedIds: string[] = Array.isArray(changes.inserted_ids)
      ? changes.inserted_ids
      : [];

    if (insertedIds.length === 0) {
      // Nothing was inserted (e.g. all were invalid/duplicate)
      // Still record the rollback attempt and return success
      await query(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, field_changes, user_id, created_at)
         VALUES (gen_random_uuid(), 'migration_rollback', 'migration', $1, $2, $3, now())`,
        [
          batch_id,
          JSON.stringify({ batch_id, rolled_back: 0, note: "no records to rollback" }),
          userId,
        ],
      );
      return NextResponse.json({ batch_id, rolled_back: 0 });
    }

    // Soft-delete or hard-delete based on entity type
    let rolledBack = 0;

    if (entityType === "client") {
      // Filter to IDs that look like UUIDs (skip 'skipped_N' placeholders)
      const realIds = insertedIds.filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
      );
      if (realIds.length > 0) {
        const placeholders = realIds.map((_, i) => `$${i + 1}`).join(", ");
        const rows = await query<{ id: string }>(
          `DELETE FROM clients WHERE id IN (${placeholders}) RETURNING id`,
          realIds,
        );
        rolledBack = rows.length;
      }
    } else if (entityType === "employee") {
      const realIds = insertedIds.filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
      );
      if (realIds.length > 0) {
        const placeholders = realIds.map((_, i) => `$${i + 1}`).join(", ");
        const rows = await query<{ id: string }>(
          `DELETE FROM employees WHERE id IN (${placeholders}) RETURNING id`,
          realIds,
        );
        rolledBack = rows.length;
      }
    } else {
      // For other entity types, mark as "rolled_back" in count but no actual delete
      rolledBack = 0;
    }

    // Record the rollback in audit_logs
    await query(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, field_changes, user_id, created_at)
       VALUES (gen_random_uuid(), 'migration_rollback', 'migration', $1, $2, $3, now())`,
      [
        batch_id,
        JSON.stringify({
          batch_id,
          entity_type: entityType,
          rolled_back: rolledBack,
          original_inserted_ids: insertedIds,
        }),
        userId,
      ],
    );

    return NextResponse.json({
      batch_id,
      entity_type: entityType,
      rolled_back: rolledBack,
    });
  } catch (err: unknown) {
    console.error("POST /api/migration/rollback error:", err);
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
