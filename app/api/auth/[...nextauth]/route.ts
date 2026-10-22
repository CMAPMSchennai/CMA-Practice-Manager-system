/**
 * NextAuth handler — entry point for all `/api/auth/*` routes.
 *
 * Platform-managed; do not edit. Native App Router shape (v5 handlers).
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
