/**
 * Centralized NextAuth configuration (v5 / Auth.js).
 *
 * Platform-managed — every generated app inherits this. Uses
 * `@auth/pg-adapter` against the canonical NextAuth tables
 * (users / accounts / sessions / verification_token) directly with
 * raw SQL. No ORM dependency. Single-table model: `users` holds both
 * NextAuth identity columns AND app business attributes (role + any
 * app-specific user fields).
 *
 * Pages Router note: v5 returns `{ handlers, auth, signIn, signOut }`
 * — App Router shape. `pages/api/auth/[...nextauth].ts` uses a
 * bridge wrapper to translate Pages Router `(req, res)` to/from
 * Web API `Request/Response` for `handlers.GET / handlers.POST`.
 *
 * Override path: apps that need additional providers (Microsoft,
 * Apple, Okta, custom SAML) add them via the `auth-extend` task type.
 * Don't fork this file — extend it.
 *
 * Configure → Auth drives feature flags via env:
 *   AUTH_EMAIL_PASSWORD_ENABLED, AUTH_GOOGLE_ENABLED, AUTH_GOOGLE_MODE,
 *   AUTH_GOOGLE_CLIENT_ID / SECRET (BYO), AUTH_MICROSOFT_*, …
 * Dual7-managed secrets are injected at sandbox boot only (never durable).
 *
 * OAuth createUser: `@auth/pg-adapter` only inserts Auth.js columns. Our
 * `users.role` is NOT NULL — wrap createUser so role is set like signup
 * (admin / user, substituted at provision).
 */
import type { Adapter, AdapterUser } from "@auth/core/adapters";
import type { NextAuthConfig } from "next-auth";
import { customFetch } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import CredentialsProvider from "next-auth/providers/credentials";
import PostgresAdapter from "@auth/pg-adapter";
import bcrypt from "bcryptjs";

import { pool } from "@/lib/db";

const DEFAULT_ROLE = "user";
const FIRST_USER_ROLE = "admin";

function buildAuthAdapter(): Adapter {
  const base = PostgresAdapter(pool);
  return {
    ...base,
    async createUser(user: Omit<AdapterUser, "id">) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const countRes = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM users`,
        );
        const isFirstUser = countRes.rows[0]?.n === "0";
        const role = isFirstUser ? FIRST_USER_ROLE : DEFAULT_ROLE;
        const displayName =
          (typeof user.name === "string" && user.name.trim()) ||
          (typeof user.email === "string" && user.email.trim()) ||
          "User";

        // App schemas often add `display_name NOT NULL` (alongside Auth.js
        // `name`). Include it when present so OAuth createUser does not fail.
        const displayCol = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1
               FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'users'
                AND column_name = 'display_name'
           ) AS exists`,
        );
        const hasDisplayName = Boolean(displayCol.rows[0]?.exists);

        const result = hasDisplayName
          ? await client.query<AdapterUser>(
              `INSERT INTO users (name, email, "emailVerified", image, role, display_name)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, name, email, "emailVerified", image`,
              [
                user.name,
                user.email,
                user.emailVerified,
                user.image,
                role,
                displayName,
              ],
            )
          : await client.query<AdapterUser>(
              `INSERT INTO users (name, email, "emailVerified", image, role)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id, name, email, "emailVerified", image`,
              [user.name, user.email, user.emailVerified, user.image, role],
            );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Public self-signup toggle. Default: enabled (`PUBLIC_SIGNUP_ENABLED=true`
 * is seeded at auth provision). Set to `false` in Configure → Auth to
 * make the app invite-only. The `/api/auth/signup` route honors this.
 */
export const isPublicSignupEnabled =
  process.env.PUBLIC_SIGNUP_ENABLED === "true";

/**
 * E2B / sandbox HTTPS iframe only — platform sets `E2B_SANDBOX=true` there.
 * For local `http://localhost`, keep `E2B_SANDBOX=false`: Secure + SameSite=None
 * cookies from the E2B cookie profile will not stick on plain HTTP.
 */
export const isE2bSandbox = process.env.E2B_SANDBOX === "true";

/** Email/password — on unless explicitly disabled. */
export const isEmailPasswordEnabled =
  process.env.AUTH_EMAIL_PASSWORD_ENABLED !== "false";

function envFlag(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true";
}

function resolveGoogleCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = (
    process.env.AUTH_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.AUTH_GOOGLE_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ""
  ).trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function resolveMicrosoftCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = (process.env.AUTH_MICROSOFT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.AUTH_MICROSOFT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export const isGoogleAuthEnabled = envFlag("AUTH_GOOGLE_ENABLED", false);

export const isGooglePlatformMode =
  (process.env.AUTH_GOOGLE_MODE || "").toLowerCase() === "platform";

export const isMicrosoftAuthEnabled = envFlag("AUTH_MICROSOFT_ENABLED", false);

export const isMicrosoftPlatformMode =
  (process.env.AUTH_MICROSOFT_MODE || "").toLowerCase() === "platform";

const platformConnectorRedirectUri = (
  process.env.AUTH_PLATFORM_CONNECTOR_REDIRECT_URI || ""
).trim();

type FetchFn = typeof fetch;

/**
 * Dual7 `/platformconnectors` owns authorize redirect_uri + state/PKCE.
 * Auth.js still defaults token exchange to this app's callback URL — rewrite
 * `redirect_uri` on code→token POSTs so it matches Dual7's registered URI.
 *
 * Do NOT set `redirectProxyUrl`: Auth.js forces `state` into `checks` whenever
 * that is set, which breaks the hop (no authjs.state cookie was ever written).
 */
function platformTokenRedirectFetch(upstream: FetchFn = fetch): FetchFn {
  const dual7Uri = platformConnectorRedirectUri;
  return async (input, init) => {
    let nextInit = init;
    const body = init?.body;
    if (
      dual7Uri &&
      (typeof body === "string" || body instanceof URLSearchParams)
    ) {
      const params =
        body instanceof URLSearchParams
          ? new URLSearchParams(body)
          : new URLSearchParams(body);
      if (params.has("code") && params.has("redirect_uri")) {
        params.set("redirect_uri", dual7Uri);
        nextInit = { ...init, body: params };
      }
    }
    return upstream(input, nextInit);
  };
}

/**
 * Auth.js `merge` drops symbol keys; `parseProviders` only copies
 * `customFetch` from `userOptions` (`provider.options`). Attach on both.
 */
function attachCustomFetch(provider: object, fetchImpl: FetchFn): void {
  const p = provider as {
    options?: Record<string | symbol, unknown>;
  } & Record<symbol, unknown>;
  p[customFetch] = fetchImpl;
  p.options = {
    ...(p.options ?? {}),
    [customFetch]: fetchImpl,
  };
}

const providers: NextAuthConfig["providers"] = [];

const googleCreds = resolveGoogleCredentials();
if (isGoogleAuthEnabled && googleCreds) {
  const usePlatformHop =
    isGooglePlatformMode && Boolean(platformConnectorRedirectUri);

  const google = GoogleProvider({
    clientId: googleCreds.clientId,
    clientSecret: googleCreds.clientSecret,
    allowDangerousEmailAccountLinking: true,
    // Dual7 owns OAuth state/PKCE via /platformconnectors — skip Auth.js checks.
    // Token redirect_uri is rewritten via customFetch (not redirectProxyUrl).
    ...(usePlatformHop ? { checks: [] as const } : {}),
  });

  if (usePlatformHop) {
    attachCustomFetch(google, platformTokenRedirectFetch());
  }
  providers.push(google);
}

const microsoftCreds = resolveMicrosoftCredentials();
if (isMicrosoftAuthEnabled && microsoftCreds) {
  const usePlatformHop =
    isMicrosoftPlatformMode && Boolean(platformConnectorRedirectUri);

  const microsoft = MicrosoftEntraID({
    clientId: microsoftCreds.clientId,
    clientSecret: microsoftCreds.clientSecret,
    issuer: `https://login.microsoftonline.com/${
      process.env.AUTH_MICROSOFT_TENANT_ID || "common"
    }/v2.0`,
    allowDangerousEmailAccountLinking: true,
    ...(usePlatformHop ? { checks: [] as const } : {}),
  });

  if (usePlatformHop) {
    const upstream =
      ((microsoft as Record<symbol, FetchFn | undefined>)[customFetch] as
        | FetchFn
        | undefined) ?? fetch;
    attachCustomFetch(microsoft, platformTokenRedirectFetch(upstream));
  }
  providers.push(microsoft);
}

if (isEmailPasswordEnabled) {
  providers.push(
    CredentialsProvider({
      name: "Email + password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Authenticator code", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const result = await pool.query<{
          id: string;
          email: string | null;
          name: string | null;
          image: string | null;
          password_hash: string | null;
          mfa_enabled: boolean;
        }>(
          `SELECT id, email, name, image, password_hash, mfa_enabled
             FROM users
            WHERE email = $1
            LIMIT 1`,
          [email],
        );
        const user = result.rows[0];
        if (!user || !user.password_hash) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        // Two-step sign-in: with MFA on, the password alone is not enough.
        if (user.mfa_enabled) {
          const { checkSignInCode } = await import("@/lib/mfa");
          const code = String(credentials?.code ?? "").trim();
          if (!code || !(await checkSignInCode(user.id, code))) return null;
        }

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  );
}

// ── Cookie config for iframe-embedded preview (E2B sandbox only) ─
const e2bIframeAuthCookies: NonNullable<NextAuthConfig["cookies"]> = {
  sessionToken: {
    name: "authjs.session-token",
    options: {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      partitioned: true,
      path: "/",
    },
  },
  csrfToken: {
    name: "__Host-authjs.csrf-token",
    options: {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      partitioned: true,
      path: "/",
    },
  },
  callbackUrl: {
    name: "authjs.callback-url",
    options: {
      sameSite: "none",
      secure: true,
      partitioned: true,
      path: "/",
    },
  },
};

export const authConfig: NextAuthConfig = {
  adapter: buildAuthAdapter(),
  session: { strategy: "jwt" },
  ...(isE2bSandbox ? { cookies: e2bIframeAuthCookies } : {}),
  pages: {
    signIn: "/login",
  },
  providers,
  events: {
    // FR-02: every successful sign-in goes into the audit trail.
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        const { createAuditLog } = await import("@/lib/audit");
        await createAuditLog({
          action: "sign_in",
          entity_type: "user",
          entity_id: user.id,
          field_changes: null,
          user_id: user.id,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] sign-in audit failed:", err);
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        try {
          const result = await pool.query<{ role: string | null }>(
            `UPDATE users
                SET role = COALESCE(role, $2)
              WHERE id = $1
              RETURNING role`,
            [user.id, DEFAULT_ROLE],
          );
          const row = result.rows[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = row?.role || DEFAULT_ROLE;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[auth] role lookup failed:", err);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = DEFAULT_ROLE;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.sub;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },
};
