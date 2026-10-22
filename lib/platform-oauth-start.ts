/**
 * Dual7-managed OAuth start — shared by App Router + Pages handlers.
 *
 * BYO mode uses Auth.js `Auth()` + `skipCSRFCheck` (Pages-safe — does not
 * touch App Router `next/headers` / `cookies()`). Do not GET `/api/auth/signin/*`
 * — Auth.js v5 rejects that as UnknownAction → error=Configuration.
 *
 * Platform mode calls Dual7 `/platformconnectors/begin` so Google/Microsoft
 * redirect to the single Dual7 callback URI, then back to this app.
 */

import { Auth, skipCSRFCheck } from "@auth/core";

import { authConfig } from "@/lib/auth-config";

export type PlatformOAuthProvider = "google" | "microsoft";

const PROVIDERS: Record<
  PlatformOAuthProvider,
  {
    modeEnv: string;
    beginProvider: "google" | "microsoft";
    nextAuthSignInId: string;
  }
> = {
  google: {
    modeEnv: "AUTH_GOOGLE_MODE",
    beginProvider: "google",
    nextAuthSignInId: "google",
  },
  microsoft: {
    modeEnv: "AUTH_MICROSOFT_MODE",
    beginProvider: "microsoft",
    nextAuthSignInId: "microsoft-entra-id",
  },
};

export function parsePlatformOAuthProvider(
  raw: string | undefined | null,
): PlatformOAuthProvider | null {
  if (raw === "google" || raw === "microsoft") return raw;
  return null;
}

export type PlatformOAuthStartResult =
  | {
      kind: "redirect";
      location: string;
      /** Set Auth.js post-login path cookie (Pages / platform hop). */
      callbackCookie?: string;
      /** BYO: state / pkce / callback-url Set-Cookie values from Auth(). */
      setCookies?: string[];
    }
  | { kind: "error"; status: 400; message: string };

/**
 * Auth.js `assertConfig` requires `authjs.callback-url` to be a real path
 * (`/…`) or `http(s):` URL. `encodeURIComponent` leaves values like `%2F` /
 * `https%3A%2F%2F…` which Auth.js rejects as InvalidCallbackUrl → client
 * sees `error=Configuration` before Google ever loads.
 *
 * Cookie flags: when `E2B_SANDBOX=true`, Secure + SameSite=None + Partitioned
 * are set for HTTPS iframe preview. For local `http://localhost`, keep
 * `E2B_SANDBOX=false` or browsers will not store these cookies.
 */
function buildAuthJsCallbackUrlCookie(callbackUrl: string): string {
  const raw = (callbackUrl || "/").trim() || "/";
  let value = "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    value = raw.split(";")[0] || "/";
  } else {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        value = parsed.toString();
      }
    } catch {
      value = "/";
    }
  }

  const httpsOrigin = (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).startsWith("https://");
  const e2b = process.env.E2B_SANDBOX === "true";
  const secure = e2b || httpsOrigin;
  const sameSite = secure ? "None" : "Lax";
  const parts = [
    `authjs.callback-url=${value}`,
    "Path=/",
    `SameSite=${sameSite}`,
    "HttpOnly",
  ];
  if (secure) parts.push("Secure");
  if (e2b) parts.push("Partitioned");
  return parts.join("; ");
}

export async function resolvePlatformOAuthStart(args: {
  provider: PlatformOAuthProvider;
  callbackUrl: string;
}): Promise<PlatformOAuthStartResult> {
  const cfg = PROVIDERS[args.provider];
  const mode = (process.env[cfg.modeEnv] || "").toLowerCase();
  const callbackCookie = buildAuthJsCallbackUrlCookie(args.callbackUrl);

  if (mode !== "platform") {
    try {
      const base = (
        process.env.AUTH_URL ||
        process.env.NEXTAUTH_URL ||
        ""
      ).replace(/\/$/, "");
      const secret =
        process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
      if (!base || !secret) {
        return {
          kind: "redirect",
          location: "/login?error=oauth_start_failed",
        };
      }

      const url = `${base}/api/auth/signin/${cfg.nextAuthSignInId}`;
      const body = new URLSearchParams({
        callbackUrl: args.callbackUrl || "/",
      });
      const req = new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const res = await Auth(req, {
        ...authConfig,
        secret,
        basePath: "/api/auth",
        trustHost: true,
        skipCSRFCheck,
      });
      const location = res.headers.get("Location");
      if (!location) {
        return {
          kind: "redirect",
          location: "/login?error=oauth_start_failed",
        };
      }
      const setCookies =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
      return {
        kind: "redirect",
        location,
        setCookies,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[oauth byo start]", err);
      return {
        kind: "redirect",
        location: "/login?error=oauth_start_failed",
      };
    }
  }

  const apiBase = (process.env.AS_PLATFORM_CONNECTOR_API_URL || "").replace(
    /\/$/,
    "",
  );
  const token = process.env.AS_PLATFORM_CONNECTOR_TOKEN || "";
  const appId = process.env.AS_APP_ID || "";
  const appOrigin = (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "");

  if (!apiBase || !token || !appId || !appOrigin) {
    return {
      kind: "redirect",
      location: "/login?error=platform_connector_misconfigured",
    };
  }

  try {
    const beginRes = await fetch(`${apiBase}/api/v1/platformconnectors/begin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-as-platform-connector-token": token,
      },
      body: JSON.stringify({
        appId,
        provider: cfg.beginProvider,
        appOrigin,
      }),
    });
    const body = (await beginRes.json().catch(() => null)) as {
      authorizeUrl?: string;
      error?: string;
    } | null;

    if (!beginRes.ok || !body?.authorizeUrl) {
      return {
        kind: "redirect",
        location: `/login?error=${encodeURIComponent(body?.error || "begin_failed")}`,
      };
    }

    return {
      kind: "redirect",
      location: body.authorizeUrl,
      callbackCookie,
    };
  } catch {
    return {
      kind: "redirect",
      location: "/login?error=platform_connector_unreachable",
    };
  }
}
