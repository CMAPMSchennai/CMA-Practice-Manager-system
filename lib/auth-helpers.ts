/**
 * Platform-managed session helper for App Router route handlers.
 *
 * NextAuth v5 (Auth.js) — `getToken({ req, secret, salt })` reads
 * the JWT-encoded session cookie. Pass a `NextRequest` from a
 * `route.ts` handler. For Server Components without a request object,
 * prefer `auth()` from `@/lib/auth`.
 *
 * This file is a SCAFFOLDING PATH — extend carefully; do not drop
 * SessionProvider consumers' contract (`getSessionUser` / `requireUser`).
 */
import type { NextRequest } from "next/server";
import { decode, getToken } from "next-auth/jwt";
import {
  AUTHJS_SESSION_COOKIE,
  AUTHJS_SESSION_COOKIE_SECURE,
  resolveAuthJsSessionCookieMode,
} from "@/lib/auth-session-cookie";

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  /** From JWT `role` claim — set by auth-config jwt callback on sign-in. */
  role?: string | null;
}

function roleFromToken(token: Record<string, unknown>): string | null {
  return typeof token.role === "string" && token.role.trim() ? token.role : null;
}

function isSecureRequest(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto === "https" || proto === "wss") return true;
  if (req.nextUrl.protocol === "https:") return true;
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return url.startsWith("https://");
}

async function getSessionUserFromCookies(
  req: NextRequest,
): Promise<SessionUser | null> {
  if (!SECRET) return null;
  try {
    const fallbackSecure = isSecureRequest(req);
    const { secureCookie, salt } = resolveAuthJsSessionCookieMode({
      getCookie: (name) => req.cookies.get(name)?.value,
      fallbackSecure,
    });
    const token = await getToken({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req: req as any,
      secret: SECRET,
      secureCookie,
      salt,
      cookieName: salt,
    });
    if (!token?.sub) return null;
    const email = typeof token.email === "string" ? token.email : null;
    const name = typeof token.name === "string" ? token.name : null;
    const role = roleFromToken(token as Record<string, unknown>);
    return { id: token.sub, email, name, role };
  } catch {
    return null;
  }
}

async function getSessionUserFromBearer(
  req: NextRequest,
): Promise<SessionUser | null> {
  if (!SECRET) return null;
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(\S+)/i);
  if (!match) return null;
  const jwt = match[1];
  for (const salt of [AUTHJS_SESSION_COOKIE, AUTHJS_SESSION_COOKIE_SECURE]) {
    try {
      const token = await decode({ token: jwt, secret: SECRET, salt });
      if (!token?.sub) continue;
      const email = typeof token.email === "string" ? token.email : null;
      const name = typeof token.name === "string" ? token.name : null;
      const role = roleFromToken(token as Record<string, unknown>);
      return { id: token.sub, email, name, role };
    } catch {
      /* try next salt */
    }
  }
  return null;
}

export async function getSessionUser(
  req: NextRequest,
): Promise<SessionUser | null> {
  const fromCookie = await getSessionUserFromCookies(req);
  if (fromCookie) return fromCookie;
  return getSessionUserFromBearer(req);
}

export class UnauthenticatedError extends Error {
  status = 401;
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new UnauthenticatedError();
  return user;
}
