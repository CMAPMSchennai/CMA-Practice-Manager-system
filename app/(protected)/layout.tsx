/**
 * Authenticated App Router shell — route group `(protected)` is NOT in the URL.
 *
 * Place authenticated pages under `app/(protected)/<segment>/page.tsx`
 * (e.g. `app/(protected)/dashboard/page.tsx` → `/dashboard`). Public pages
 * stay at `app/<segment>/page.tsx`. Session gate runs here so every child
 * requires a logged-in user; middleware PROTECTED_PREFIXES remains a
 * fast-path bouncer for known URL prefixes.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/ProtectedShell";
import { getPasswordChangeState } from "@/lib/temp-password";
import { getUserRole } from "@/lib/rbac";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Users on an admin-issued one-time password must set their own first (Gap #14).
  if (session.user.id && (await getPasswordChangeState(session.user.id)).required) {
    redirect("/change-password");
  }
  // FR-03: the menu only shows modules this user's role can open.
  const role = session.user.id ? await getUserRole(session.user.id) : null;
  return (
    <ProtectedShell permissions={role?.permissions ?? {}} roleName={role?.name ?? null}>
      {children}
    </ProtectedShell>
  );
}
