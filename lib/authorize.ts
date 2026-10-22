/**
 * Role-gated authorization helper for App Router.
 *
 * Apps wrap protected route handlers with:
 *
 *   const user = await authorize(req, "Admin", "Counselor");
 *
 * Throws `AuthorizationError` for unauthenticated/unauthorized; the
 * caller catches and translates to a 401/403 JSON response.
 *
 * For Server Components, prefer `auth()` from `@/lib/auth` or
 * `authorizePageOrRedirect` below.
 */
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { auth } from "@/lib/auth";

export type AppRole = 'admin' | 'user';

export const APP_ROLES: readonly AppRole[] = ['admin', 'user'] as const;

export class AuthorizationError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthorizationError";
  }
}

/**
 * Assert the request's session belongs to a user with one of the
 * allowed roles. Pass no roles to require ANY authenticated user.
 */
export async function authorize(
  req: NextRequest,
  ...allowedRoles: AppRole[]
): Promise<{ id: string; email: string | null; name: string | null; role?: AppRole }> {
  const session = await getSessionUser(req);
  if (!session) {
    throw new AuthorizationError(401, "Not authenticated");
  }
  const role = session.role as AppRole | undefined;
  if (allowedRoles.length === 0) {
    return { ...session, role };
  }
  if (!role) {
    throw new AuthorizationError(
      403,
      "User has no role assigned — complete onboarding first.",
    );
  }
  if (!allowedRoles.includes(role)) {
    throw new AuthorizationError(
      403,
      `Role '${role}' not in allow-list [${allowedRoles.join(", ")}]`,
    );
  }
  return { ...session, role };
}

/**
 * Server Component / page helper: returns the authorized user or
 * redirects to `/login`. Uses NextAuth `auth()` (no request object).
 *
 * Usage in a Server Component page:
 *
 *   const user = await authorizePageOrRedirect("/admin", "Admin");
 */
export async function authorizePageOrRedirect(
  pathname: string,
  ...allowedRoles: AppRole[]
): Promise<{ id: string; email: string | null; name: string | null; role?: AppRole }> {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }
  const user = session.user as {
    id?: string;
    email?: string | null;
    name?: string | null;
    role?: AppRole;
  };
  const id = user.id ?? (session as { user?: { id?: string } }).user?.id;
  if (!id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }
  const role = user.role;
  if (allowedRoles.length === 0) {
    return {
      id,
      email: user.email ?? null,
      name: user.name ?? null,
      role,
    };
  }
  if (!role || !allowedRoles.includes(role)) {
    redirect("/access-denied");
  }
  return {
    id,
    email: user.email ?? null,
    name: user.name ?? null,
    role,
  };
}
