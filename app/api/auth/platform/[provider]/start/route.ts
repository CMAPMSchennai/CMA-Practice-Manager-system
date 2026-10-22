/**
 * Start Dual7-managed social login, or fall through to Auth.js for BYO.
 * GET /api/auth/platform/:provider/start?callbackUrl=…
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parsePlatformOAuthProvider,
  resolvePlatformOAuthStart,
} from "@/lib/platform-oauth-start";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await ctx.params;
  const provider = parsePlatformOAuthProvider(raw);
  if (!provider) {
    return NextResponse.redirect(
      new URL("/login?error=unknown_provider", req.url),
    );
  }

  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/";
  const result = await resolvePlatformOAuthStart({ provider, callbackUrl });

  if (result.kind === "error") {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  const location = /^https?:\/\//i.test(result.location)
    ? result.location
    : new URL(result.location, req.url).toString();

  const res = NextResponse.redirect(location);
  if (result.setCookies?.length) {
    for (const cookie of result.setCookies) {
      res.headers.append("Set-Cookie", cookie);
    }
  } else if (result.callbackCookie) {
    res.headers.set("Set-Cookie", result.callbackCookie);
  }
  return res;
}
