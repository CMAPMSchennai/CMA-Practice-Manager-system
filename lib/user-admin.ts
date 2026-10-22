/**
 * Shared rules for admin actions on staff logins (Gap #12 / Gap #14).
 */
import type { NextRequest } from "next/server";
import { query } from "@/lib/db";

/** Role ids and the actor's MP status, for the Managing Partner guard. */
export async function getManagingPartnerContext(actorId: string): Promise<{
  mpRoleId: string | null;
  activeMpCount: number;
  actorIsMp: boolean;
}> {
  const mpRows = await query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'managing_partner' LIMIT 1`,
  );
  const mpRoleId = mpRows[0]?.id ?? null;
  if (!mpRoleId) return { mpRoleId: null, activeMpCount: 0, actorIsMp: false };
  const activeMps = await query<{ id: string }>(
    `SELECT id FROM users WHERE role_id = $1 AND is_active = true`,
    [mpRoleId],
  );
  return {
    mpRoleId,
    activeMpCount: activeMps.length,
    actorIsMp: activeMps.some((u) => u.id === actorId),
  };
}

/**
 * Only a Managing Partner may create or reset a Managing Partner's login.
 * While no active MP exists yet, a user manager may appoint the first one.
 */
export async function managingPartnerGuardError(
  actorId: string,
  targetRoleId: string | null,
): Promise<string | null> {
  const ctx = await getManagingPartnerContext(actorId);
  if (!ctx.mpRoleId || targetRoleId !== ctx.mpRoleId) return null;
  if (ctx.actorIsMp || ctx.activeMpCount === 0) return null;
  return "Only a Managing Partner can create or reset a Managing Partner's login";
}

/** Public sign-in URL to hand to the new user alongside the one-time password. */
export function loginUrlFor(req: NextRequest): string {
  const base = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").trim() || req.nextUrl.origin;
  return `${base.replace(/\/+$/, "")}/login`;
}
