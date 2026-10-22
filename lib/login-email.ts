/**
 * The email that carries a new person's one-time sign-in details (added feature F5).
 * The password works once, expires, and must be replaced at first sign-in.
 */
import { sendEmail, type SendResult } from "@/lib/integrations/email";
import { createAuditLog } from "@/lib/audit";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function expiryText(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export async function emailLoginDetails(opts: {
  userId: string;
  actorId: string;
  to: string;
  name: string | null;
  roleName: string | null;
  password: string;
  expiresAt: string;
  loginUrl: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SendResult> {
  const name = (opts.name ?? "").trim() || "there";
  const expiry = expiryText(opts.expiresAt);
  const needsTwoStep = opts.roleName === "partner" || opts.roleName === "managing_partner";
  const twoStep = needsTwoStep
    ? "As a Partner, you will also set up two-step sign-in on your phone with an authenticator app, and keep the recovery codes safe."
    : "";

  const text = [
    `Hello ${name},`,
    "",
    "A login has been created for you on the CMA Practice Manager.",
    "",
    `Sign-in page: ${opts.loginUrl}`,
    `Email: ${opts.to}`,
    `One-time password: ${opts.password}`,
    "",
    `This password works once and expires on ${expiry}. When you sign in, the app asks you to choose your own password.`,
    twoStep,
    "",
    "Please do not forward this email. If you were not expecting it, do not sign in, and tell the person who manages the system at your firm.",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16233B;max-width:560px">
<p>Hello ${esc(name)},</p>
<p>A login has been created for you on the <strong>CMA Practice Manager</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:4px 12px 4px 0;color:#56637A">Sign-in page</td><td><a href="${esc(opts.loginUrl)}">${esc(opts.loginUrl)}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#56637A">Email</td><td>${esc(opts.to)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#56637A">One-time password</td><td><code style="background:#F2F5FA;padding:3px 8px;border-radius:4px;font-size:15px">${esc(opts.password)}</code></td></tr>
</table>
<p>This password works once and expires on <strong>${esc(expiry)}</strong>. When you sign in, the app asks you to choose your own password.</p>
${twoStep ? `<p>${esc(twoStep)}</p>` : ""}
<p style="color:#56637A;font-size:12px">Please do not forward this email. If you were not expecting it, do not sign in, and tell the person who manages the system at your firm.</p>
</div>`;

  const result = await sendEmail({ to: opts.to, subject: "Your CMA Practice Manager sign-in details", text, html });

  try {
    await createAuditLog({
      action: result.ok ? "send_login_email" : "send_login_email_failed",
      entity_type: "user",
      entity_id: opts.userId,
      field_changes: {
        sent_to: { before: null, after: opts.to },
        ...(result.ok ? {} : { error: { before: null, after: result.error } }),
      },
      user_id: opts.actorId,
      ip_address: opts.ip ?? null,
      user_agent: opts.userAgent ?? null,
    });
  } catch (err) {
    console.error("[login-email] audit failed:", err);
  }
  return result;
}
