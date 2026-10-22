import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission, handleRbacError } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * GET /api/payroll-readiness-thresholds/:entity_id
 *
 * Fetch the payroll readiness threshold configuration for a given entity.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entity_id: string }> }
) {
  try {
    await requirePermission(req, "view_payroll");

    const { entity_id } = await params;

    const rows = await query<{
      id: string;
      entity_id: string;
      min_task_completion_pct: number;
      allow_partial_release: boolean;
      config: Record<string, unknown> | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, entity_id, min_task_completion_pct, allow_partial_release, config, updated_by, created_at, updated_at
         FROM payroll_readiness_thresholds
        WHERE entity_id = $1`,
      [entity_id]
    );

    if (rows.length === 0) {
      // Return defaults when no record exists
      return NextResponse.json({
        threshold: {
          entity_id,
          min_task_completion_pct: 1.0,
          allow_partial_release: false,
          config: null,
        },
      });
    }

    return NextResponse.json({ threshold: rows[0] });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/payroll-readiness-thresholds/:entity_id
 *
 * Update (or create) payroll readiness thresholds for an entity.
 * Requires manage_entities permission — only MP and Admin have this.
 * Partners will get 403.
 *
 * Body: { min_task_completion_pct?, allow_partial_release?, config? }
 *
 * AC US019-2: PATCH → 403 for non-MP/Admin roles (partner)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entity_id: string }> }
) {
  try {
    const user = await requirePermission(req, "manage_entities");

    const { entity_id } = await params;

    // Verify entity exists
    const entityRows = await query<{ id: string }>(
      `SELECT id FROM entities WHERE id = $1`,
      [entity_id]
    );
    if (entityRows.length === 0) {
      return NextResponse.json(
        { error: "Entity not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      min_task_completion_pct,
      allow_partial_release,
      config,
    } = body as {
      min_task_completion_pct?: number;
      allow_partial_release?: boolean;
      config?: Record<string, unknown>;
    };

    // Validate min_task_completion_pct if provided
    if (
      min_task_completion_pct !== undefined &&
      (typeof min_task_completion_pct !== "number" ||
        min_task_completion_pct < 0 ||
        min_task_completion_pct > 1)
    ) {
      return NextResponse.json(
        { error: "min_task_completion_pct must be a number between 0 and 1" },
        { status: 422 }
      );
    }

    // Check if threshold record already exists
    const existing = await query<{
      id: string;
      min_task_completion_pct: number;
      allow_partial_release: boolean;
      config: Record<string, unknown> | null;
    }>(
      `SELECT id, min_task_completion_pct, allow_partial_release, config
         FROM payroll_readiness_thresholds
        WHERE entity_id = $1`,
      [entity_id]
    );

    let result;

    if (existing.length > 0) {
      // Update
      const prev = existing[0];
      const newPct =
        min_task_completion_pct !== undefined
          ? min_task_completion_pct
          : Number(prev.min_task_completion_pct);
      const newPartial =
        allow_partial_release !== undefined
          ? allow_partial_release
          : prev.allow_partial_release;
      const newConfig = config !== undefined ? config : prev.config;

      result = await query<{
        id: string;
        entity_id: string;
        min_task_completion_pct: number;
        allow_partial_release: boolean;
        config: Record<string, unknown> | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `UPDATE payroll_readiness_thresholds
            SET min_task_completion_pct = $2,
                allow_partial_release = $3,
                config = $4,
                updated_by = $5,
                updated_at = now()
          WHERE entity_id = $1
          RETURNING id, entity_id, min_task_completion_pct, allow_partial_release, config, updated_by, created_at, updated_at`,
        [entity_id, newPct, newPartial, newConfig ? JSON.stringify(newConfig) : null, user.id]
      );

      // Audit log
      await createAuditLog({
        action: "update",
        entity_type: "payroll_readiness_thresholds",
        entity_id: prev.id,
        field_changes: {
          ...(min_task_completion_pct !== undefined
            ? {
                min_task_completion_pct: {
                  before: prev.min_task_completion_pct,
                  after: min_task_completion_pct,
                },
              }
            : {}),
          ...(allow_partial_release !== undefined
            ? {
                allow_partial_release: {
                  before: prev.allow_partial_release,
                  after: allow_partial_release,
                },
              }
            : {}),
        },
        user_id: user.id,
        ip_address:
          req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    } else {
      // Insert
      result = await query<{
        id: string;
        entity_id: string;
        min_task_completion_pct: number;
        allow_partial_release: boolean;
        config: Record<string, unknown> | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `INSERT INTO payroll_readiness_thresholds
           (entity_id, min_task_completion_pct, allow_partial_release, config, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, entity_id, min_task_completion_pct, allow_partial_release, config, updated_by, created_at, updated_at`,
        [
          entity_id,
          min_task_completion_pct ?? 1.0,
          allow_partial_release ?? false,
          config ? JSON.stringify(config) : null,
          user.id,
        ]
      );

      // Audit log
      await createAuditLog({
        action: "create",
        entity_type: "payroll_readiness_thresholds",
        entity_id: result[0].id,
        field_changes: {
          min_task_completion_pct: {
            before: null,
            after: min_task_completion_pct ?? 1.0,
          },
          allow_partial_release: {
            before: null,
            after: allow_partial_release ?? false,
          },
        },
        user_id: user.id,
        ip_address:
          req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        user_agent: req.headers.get("user-agent"),
      });
    }

    return NextResponse.json({ threshold: result[0] });
  } catch (err: unknown) {
    const { status, body } = handleRbacError(err);
    return NextResponse.json(body, { status });
  }
}
