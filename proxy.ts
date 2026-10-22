/**
 * Next.js proxy (Next 16+) — fast-path auth check for protected zones only.
 * Formerly `middleware.ts` (still honored on older apps if present).
 *
 * Architectural model: **public by default, protected where listed.**
 * Most modern SaaS / business apps have substantial public surface
 * (marketing, pricing, blog, signup, password reset). Forcing auth
 * everywhere and allowlisting the public routes was the wrong default.
 *
 * Two enforcement layers:
 *   1. THIS proxy — fast bouncer for `PROTECTED_PREFIXES`.
 *      Routes not in the list pass through with no DB hit. Routes
 *      in the list need a session; missing session → /login (pages)
 *      or 401 JSON (API).
 *   2. `lib/authorize.ts` — the REAL source of truth for fine-
 *      grained auth + role gating. API routes and `getServerSideProps`
 *      call `authorize(req, ...roles)` to enforce specific role sets.
 *
 * Edit `PROTECTED_PREFIXES` to add app-specific zones — e.g. an app
 * with a `/portal/**` surface adds `/portal` to the list.
 *
 * Session reads use `getToken` from `next-auth/jwt` (Pages Router has no
 * `auth()` helper). NextAuth v5 requires explicit `salt` matching the
 * session cookie name. `fallbackSecure` guesses from `AUTH_URL` /
 * `NEXTAUTH_URL` and `req.nextUrl.protocol`; when both disagree with the
 * cookie NextAuth set, `resolveAuthJsSessionCookieMode` prefers whichever
 * session cookie is present on the request.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { resolveAuthJsSessionCookieMode } from "@/lib/auth-session-cookie";

function getAuthSecret(): string {
  return (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
}

/**
 * Path prefixes that require an authenticated session at the
 * proxy layer. Anything NOT in this list is public.
 *
 * Conventions the platform expects (URL prefixes — not filesystem folders):
 *   /dashboard    — primary authenticated app shell (preferred)
 *   /admin        — admin-only surface (role-gated further by authorize())
 *   /account      — user account settings
 *   /api/private  — private API routes (return 401 JSON on miss)
 *   /api/staff    — staff-only API
 *   /app          — legacy URL zone (Pages Router `pages/app/**`); avoid for
 *                   new App Router apps — use `app/(protected)/…` instead
 *                   (route group is not in the URL; add each URL here).
 *
 * App Router filesystem convention (does not appear in the URL):
 *   Authenticated UI → `app/(protected)/<segment>/page.tsx` (layout session-gates)
 *   Public UI        → `app/<segment>/page.tsx`
 * Extend this list when you add protected URLs outside the defaults.
 *
 * Public-by-default surface (no entry needed):
 *   /             — landing page
 *   /pricing, /about, /contact, /features
 *   /login, /signup, /forgot-password, /reset-password/[token]
 *   /api/auth/*   — NextAuth's own handlers
 *   /api/public/* — explicitly public APIs
 *   /blog, /docs, anything else
 */
const PROTECTED_PREFIXES: string[] = [
  // Platform-owned integration routes execute vendor calls with the
  // workspace's credentials. Without this they are callable by anyone who can
  // reach the app, which bypasses this app's own login entirely.
  "/api/integrations",
  "/app",
  "/dashboard",
  "/admin",
  "/account",
  "/api/private",
  "/api/staff",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Mobile preview + Expo call the web API from a different e2b origin — allow CORS on /api/*. */
const INTEGRATION_ROUTE_TOKEN_HEADER = "x-as-integration-token";

const MOBILE_CORS_ALLOW_HEADERS =
  "Content-Type, Authorization, Cookie, X-Requested-With, Accept, Origin";

/**
 * Exact origins allowed to make credentialed cross-origin calls, set by the
 * platform when it knows this app's companion origins (mobile preview, custom
 * domain). When present it REPLACES the sandbox-suffix heuristic below —
 * that heuristic necessarily trusts every other tenant's sandbox, because all
 * of them are served from the same wildcard domain.
 */
const ALLOWED_CORS_ORIGINS = (process.env.AS_ALLOWED_CORS_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function isMobileClientOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_CORS_ORIGINS.length > 0) {
    return ALLOWED_CORS_ORIGINS.includes(origin);
  }
  if (origin.startsWith("exp://")) return true;
  let host: string;
  try {
    const url = new URL(origin);
    host = url.hostname;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1") return true;
  // Suffix match on the parsed hostname, not substring on the raw origin:
  // `includes(".e2b.app")` also matched hosts like `x.e2b.app.attacker.com`.
  return host === "e2b.app" || host.endsWith(".e2b.app");
}

/**
 * Observed-origin reporting — MEASUREMENT ONLY, changes no decision.
 *
 * `isMobileClientOrigin` above is the platform's current guess at who may make
 * credentialed cross-origin calls here, and it is wrong in both directions: it
 * trusts every `*.e2b.app` host, which is every other tenant's sandbox on the
 * shared preview domain, while missing most of the host families the platform
 * actually serves previews from. Replacing that guess with a real allowlist
 * needs to know which origins are genuine, and nothing has ever recorded one.
 *
 * Inert unless the platform injected both env vars. Deduped per origin per
 * process so a hot reload loop or a crawler cannot turn this into a request
 * amplifier; the sink aggregates anyway. Fire-and-forget, never awaited, and
 * every failure is swallowed — an observation must never delay or fail the
 * operator's request.
 */
const ORIGIN_REPORT_URL = process.env.AS_ORIGIN_REPORT_URL ?? "";
const ORIGIN_REPORT_TOKEN = process.env.AS_ORIGIN_REPORT_TOKEN ?? "";
const reportedOrigins = new Set<string>();
/** Bound the per-process memory a hostile caller can cause us to hold. */
const MAX_REPORTED_ORIGINS = 50;

function reportObservedOrigin(
  origin: string | null,
  allowed: boolean,
  kind: "request" | "preflight",
  path: string,
): void {
  if (!origin || !ORIGIN_REPORT_URL || !ORIGIN_REPORT_TOKEN) return;
  const dedupeKey = `${kind}:${origin}`;
  if (reportedOrigins.has(dedupeKey)) return;
  if (reportedOrigins.size >= MAX_REPORTED_ORIGINS) return;
  reportedOrigins.add(dedupeKey);
  void fetch(ORIGIN_REPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-as-origin-token": ORIGIN_REPORT_TOKEN,
    },
    body: JSON.stringify({ origins: [{ origin, allowed, kind, path }] }),
  }).catch(() => undefined);
}

function applyMobileApiCors(
  req: NextRequest,
  res: NextResponse,
  kind: "request" | "preflight" = "request",
): NextResponse {
  const origin = req.headers.get("origin");
  const allowed = isMobileClientOrigin(origin);
  // Reported before the header decision so a REFUSED origin is recorded too —
  // those are the ones being broken in silence, and a refused preflight means
  // the real request is never sent, so they appear nowhere else at all.
  reportObservedOrigin(origin, allowed, kind, req.nextUrl.pathname);
  if (allowed && origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.append("Vary", "Origin");
  }
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.headers.set("Access-Control-Allow-Headers", MOBILE_CORS_ALLOW_HEADERS);
  res.headers.set("Access-Control-Expose-Headers", "Set-Cookie");
  return res;
}

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");

  // An external caller must never be able to present this header. It is proof
  // that THIS middleware verified a session, so it is stripped on the way in
  // and re-added below only after that verification succeeds.
  const inbound = new Headers(req.headers);
  inbound.delete(INTEGRATION_ROUTE_TOKEN_HEADER);
  const passThrough = () =>
    NextResponse.next({ request: { headers: inbound } });

  if (isApi && req.method === "OPTIONS") {
    return applyMobileApiCors(
      req,
      new NextResponse(null, { status: 204 }),
      "preflight",
    );
  }

  const withCors = (res: NextResponse) =>
    isApi ? applyMobileApiCors(req, res) : res;

  // Public route — pass through immediately. NO token lookup at all
  // for the marketing / public surface; that keeps cold latency low.
  if (!isProtected(pathname)) return withCors(passThrough());

  // Protected route — verify the session token via NextAuth v5's
  // `getToken`. Two layers of detail conspire here:
  //
  // 1. In the request proxy, `req.url` is path-only — v5's
  //    auto-detection of `secureCookie` via
  //    `req.url.startsWith("https://")` always returns false.
  //
  // 2. `req.nextUrl.protocol` ALSO reports `"http:"` on hosts that
  //    sit behind a TLS-terminating edge proxy (e2b, Cloudflare,
  //    Fly, …). Next.js sees the internal forwarded request, not
  //    the external scheme.
  //
  // So neither `req.url` nor `req.nextUrl.protocol` is reliable alone.
  // `fallbackSecure` combines env (`AUTH_URL` / `NEXTAUTH_URL`, set by
  // the platform rewriter to the sandbox origin) with the request URL
  // protocol. `resolveAuthJsSessionCookieMode` then prefers whichever
  // session cookie exists on the wire when env and browser disagree.
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  const fallbackSecure =
    envUrl.startsWith("https://") || req.nextUrl.protocol === "https:";
  const { secureCookie, salt } = resolveAuthJsSessionCookieMode({
    getCookie: (name) => req.cookies.get(name)?.value,
    fallbackSecure,
  });
  const secret = getAuthSecret();
  let session: { sub?: string } | null = null;
  let decryptError: string | null = null;
  if (secret) {
    try {
      // NextRequest is an Edge runtime variant; getToken's typed `req`
      // accepts it via the `Request` branch but TS strict mode prefers
      // an explicit cast to silence the `Headers | Record<string,
      // string>` mismatch on the headers shape.
      //
      // `salt` is REQUIRED for v5 JWE decryption: it must equal the
      // session cookie name NextAuth used at sign-in. Without a
      // matching `salt` + `secureCookie`, `getToken` silently decrypts
      // to null and protected routes bounce to /login.
      //
      // `cookieName` must match `salt` so SessionStore aggregates `.0`, `.1`, … chunks.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session = (await getToken({
        req: req as unknown as Parameters<typeof getToken>[0]["req"],
        secret,
        secureCookie,
        salt,
        cookieName: salt,
      })) as any;
    } catch (err) {
      decryptError = err instanceof Error ? err.message : String(err);
      session = null;
    }
  }
  if (session?.sub) {
    // Session verified. Vouch for the request to the integration routes, which
    // cannot check a cookie themselves — they are plain handlers with no
    // NextAuth dependency, and an app may not have auth provisioned at all.
    const token = process.env.AS_INTEGRATION_ROUTE_TOKEN;
    if (token) inbound.set(INTEGRATION_ROUTE_TOKEN_HEADER, token);
    return withCors(passThrough());
  }

  // Diagnostic — fires only on protected-route session-check failures.
  // Drop once the cookie/decryption issue is fully resolved.
  // eslint-disable-next-line no-console
  console.warn(
    // Say what actually happens. An /api/ request is answered with 401 JSON a
    // few lines below, never redirected — but this line claimed a redirect for
    // every path, so a blocked API call read as a login problem and sent
    // debugging down the wrong track.
    `[proxy] ${isApi ? `401 ${pathname}` : `redirect ${pathname} → /login`}`,
    JSON.stringify({
      hasSecret: !!secret,
      secretLen: secret ? secret.length : 0,
      fallbackSecure,
      secureCookie,
      salt,
      protocol: req.nextUrl.protocol,
      cookieKeys: Array.from(req.cookies.getAll()).map((c) => c.name),
      secureTokenPresent:
        !!req.cookies.get("__Secure-authjs.session-token") ||
        !!req.cookies.get("__Secure-authjs.session-token.0"),
      bareTokenPresent:
        !!req.cookies.get("authjs.session-token") ||
        !!req.cookies.get("authjs.session-token.0"),
      sessionResult: session === null ? "null" : "object",
      sessionSub: session?.sub ?? null,
      decryptError,
    }),
  );

  // API protected route → 401 JSON so callers can handle programmatically.
  if (pathname.startsWith("/api/")) {
    return withCors(
      NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      ),
    );
  }

  // Page protected route → redirect to /login, preserving the
  // originally requested path so post-login returns there.
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return withCors(NextResponse.redirect(loginUrl));
}

export const config = {
  // Match every route EXCEPT static assets + favicon. The proxy
  // short-circuits public routes itself, so the matcher is broad.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
