/**
 * NextAuth v5 (Auth.js) entry — App Router native shape.
 *
 * Platform-managed. Exports `handlers` for the route at
 * `app/api/auth/[...nextauth]/route.ts`, plus `auth` / `signIn` /
 * `signOut` for Server Components and server actions.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
