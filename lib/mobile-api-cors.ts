/**
 * CORS for mobile clients (Expo / mobile web-preview) calling the web API
 * from a different origin. Web browser login uses same-origin NextAuth cookies;
 * mobile uses /api/mobile/auth/* JSON endpoints instead.
 *
 * App Router shape. This file was previously a verbatim copy of the Pages
 * Router version — it imported `NextApiRequest`/`NextApiResponse` from `next`
 * and took them in every signature, which no `route.ts` handler can supply, so
 * it shipped into every App Router app as code that could not be called.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOW_HEADERS =
  "Content-Type, Authorization, Cookie, X-Requested-With, Accept, Origin";

export function isMobileClientOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (origin.startsWith("exp://")) return true;
  // Suffix match on the PARSED hostname, not a substring on the raw origin.
  // `origin.includes(".e2b.app")` — what this used to be — also matched hosts
  // like `https://x.e2b.app.attacker.com`, handing an attacker-controlled
  // domain credentialed access to the app's API. The same fix landed in the
  // platform auth proxy; this copy never received it.
  let host: string;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    host = url.hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1") return true;
  return host === "e2b.app" || host.endsWith(".e2b.app");
}

/**
 * Decorate a response with the mobile CORS headers.
 *
 * The origin-conditional pair (Allow-Origin, Allow-Credentials) is only set for
 * an allowed origin; the rest are unconditional, matching the platform proxy.
 */
export function applyMobileApiCors(
  req: NextRequest,
  res: NextResponse,
): NextResponse {
  const origin = req.headers.get("origin");
  if (isMobileClientOrigin(origin) && origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.append("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
  res.headers.set("Access-Control-Expose-Headers", "Set-Cookie");
  return res;
}

/**
 * A 204 preflight response, or null when this is not a preflight.
 *
 * Usage in a route handler:
 *   export async function OPTIONS(req: NextRequest) {
 *     return handleMobileApiCorsPreflight(req) ?? new NextResponse(null, { status: 204 });
 *   }
 */
export function handleMobileApiCorsPreflight(
  req: NextRequest,
): NextResponse | null {
  if (req.method !== "OPTIONS") return null;
  return applyMobileApiCors(req, new NextResponse(null, { status: 204 }));
}
