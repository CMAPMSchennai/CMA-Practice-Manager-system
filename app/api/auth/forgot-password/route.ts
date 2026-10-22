/**
 * Forgot-password endpoint — SCAFFOLDING. Platform-managed.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes, createHash } from "crypto";
import { pool } from "@/lib/db";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  let body: { email?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Email required" },
      { status: 400 },
    );
  }

  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const user = userResult.rows[0];

  if (user) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + TOKEN_TTL_MS);

    await pool.query(
      `INSERT INTO verification_token (identifier, token, expires)
       VALUES ($1, $2, $3)
       ON CONFLICT (identifier, token) DO NOTHING`,
      [`password-reset:${email}`, tokenHash, expires],
    );

    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
    const resetLink = `${baseUrl}/reset-password/${rawToken}?email=${encodeURIComponent(email)}`;

    await sendResetEmail(email, resetLink).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[auth/forgot-password] email send failed:", err);
    });
  }

  return NextResponse.json({
    success: true,
    message: "If an account exists for that email, a reset link has been sent.",
  });
}

async function sendResetEmail(email: string, resetLink: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[auth/forgot-password] RESEND_API_KEY missing — reset link for ${email}: ${resetLink}`,
    );
    return;
  }

  // RESEND_FROM_EMAIL is the canonical key the platform materializes from the
  // integration's `from_email` setting; RESEND_FROM_ADDRESS is its alias and
  // what this file has always read. Accept both.
  //
  // No default. The sender is an attribute of the integration, not something
  // platform code may invent: Resend rejects any address on an unverified
  // domain, so a hardcoded one guarantees a bounce — and this function's caller
  // discards the error, so the failure is invisible. The old
  // `no-reply@example.com` behaved exactly that way. Treat a missing sender the
  // same as a missing API key, one branch above: say so, and hand the operator
  // the link so the reset is not lost.
  const from = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_ADDRESS;
  if (!from) {
    // eslint-disable-next-line no-console
    console.warn(
      `[auth/forgot-password] no Resend sender address configured ` +
        `(set Sender Email on the Resend integration) — reset link for ${email}: ${resetLink}`,
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reset your password",
      text: `Reset your password: ${resetLink}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}
