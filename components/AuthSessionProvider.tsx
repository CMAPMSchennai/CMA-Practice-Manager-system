"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Platform-owned session shell.
 *
 * Locked path. Replaces the scaffold passthrough so `useSession()` works
 * once NextAuth routes exist.
 */
export function AuthSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
