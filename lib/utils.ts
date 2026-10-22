import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCAL_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

function isRelativeAppPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * Post-sign-in navigation target for sandbox iframe previews.
 * NextAuth may return `result.url` bound to `NEXTAUTH_URL=http://localhost:3000`
 * while the browser is on the public e2b preview origin — following that URL
 * triggers Chrome's private-network block. Prefer same-origin relative paths.
 */
export function resolveSafePostAuthPath(
  fallback: string,
  authResultUrl?: string | null,
): string {
  const safeFallback = isRelativeAppPath(fallback) ? fallback : "/";

  if (!authResultUrl?.trim()) return safeFallback;

  const trimmed = authResultUrl.trim();
  if (isRelativeAppPath(trimmed)) return trimmed;
  if (LOCAL_NETWORK_ORIGIN.test(trimmed)) return safeFallback;

  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin === window.location.origin) {
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        return path || "/";
      }
    } catch {
      // ignore malformed URLs
    }
  }

  return safeFallback;
}
