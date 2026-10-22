/**
 * Shared email sender for the whole system (added feature F5).
 *
 * Sends through the Gmail account connected in the Dual7 workbench
 * (Workbench > Configure > Integrations). Every feature that needs to send mail
 * calls sendEmail(); none of them talk to Gmail themselves.
 *
 * Gmail fills in the From address from the connected account. This sends plain
 * text plus a simple HTML copy. No attachments yet.
 */
import { randomBytes } from "crypto";
import { handleIntegrationAction } from "@/lib/integrations/connectors/handleIntegrationAction";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

const EMAIL_SHAPE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Base64 in 76-character lines, as email expects. */
function wrapped(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}

function buildRaw(mail: OutgoingEmail): string {
  const boundary = `cmapms_${randomBytes(12).toString("hex")}`;
  const subject = `=?UTF-8?B?${Buffer.from(mail.subject, "utf8").toString("base64")}?=`;
  const lines = [
    `To: ${mail.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapped(mail.text),
  ];
  if (mail.html) {
    lines.push(
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapped(mail.html),
    );
  }
  lines.push(`--${boundary}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  const to = mail.to.trim();
  if (!EMAIL_SHAPE.test(to)) return { ok: false, error: "The email address does not look right." };

  try {
    const result = await handleIntegrationAction(
      "gmail",
      "gmail_users_messages_send",
      { raw: buildRaw({ ...mail, to }) },
      {
        method: "POST",
        // The platform's Gmail base address already ends in /users/me.
        endpoint: "/messages/send",
        fields: [{ key: "raw", location: "body" }],
      },
    );
    if (result.success) return { ok: true };

    // Google can answer with a whole web page; keep only a short readable line.
    const rawWhy = String(result.error ?? "");
    const why = /<\s*(!doctype|html)/i.test(rawWhy)
      ? `Google returned a page instead of an answer (status ${result.statusCode}).`
      : rawWhy;
    if (/not connected|unknown integration|manifest/i.test(why)) {
      return { ok: false, error: "Email is not connected yet. Connect Gmail in the Dual7 workbench, then restart the app." };
    }
    if (result.statusCode === 401 || result.statusCode === 403) {
      return { ok: false, error: `Gmail refused the request (${why.slice(0, 160) || result.statusCode}). Reconnect Gmail and restart the app.` };
    }
    return { ok: false, error: why.slice(0, 200) || "Gmail did not accept the message." };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Could not reach Gmail." };
  }
}
