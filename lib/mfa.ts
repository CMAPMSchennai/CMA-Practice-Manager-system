/**
 * Two-step sign-in for Partners and the Managing Partner (NFR: MFA).
 *
 * Standard time-based one-time codes (TOTP, RFC 6238: 6 digits, 30 seconds),
 * so any authenticator app works (Google Authenticator, Microsoft
 * Authenticator, Authy). The secret is encrypted in the database with the same
 * key as PAN and salary. Ten single-use recovery codes are stored only as
 * hashes. Wrong guesses are limited per person.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { query } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/field-crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUri(secret: string, account: string): string {
  const label = encodeURIComponent(`CMA Practice Manager:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("CMA Practice Manager")}&algorithm=SHA1&digits=6&period=30`;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Accepts the current code and the one either side (clock drift). */
export function verifyTotp(secret: string, code: string): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 30000);
  let ok = false;
  for (const d of [-1, 0, 1]) if (same(hotp(key, step + d), clean)) ok = true;
  return ok;
}

/* ---------- recovery codes ---------- */

const hashCode = (c: string) => createHash("sha256").update(c.replace(/[\s-]/g, "").toUpperCase()).digest("hex");

export function newRecoveryCodes(): { plain: string[]; stored: string } {
  const plain = Array.from({ length: 10 }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, stored: JSON.stringify(plain.map(hashCode)) };
}

/* ---------- wrong-guess limit ---------- */

const attempts = new Map<string, { n: number; first: number }>();
const WINDOW = 10 * 60 * 1000;
const MAX = 6;

export function tooManyTries(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW) {
    attempts.delete(key);
    return false;
  }
  return a.n >= MAX;
}
export function noteFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW) attempts.set(key, { n: 1, first: Date.now() });
  else a.n++;
}
export function clearFailures(key: string) {
  attempts.delete(key);
}

/* ---------- per-user operations ---------- */

interface MfaRow {
  id: string;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_recovery_codes: string | null;
  mfa_enrolled_at: string | null;
}

export async function getMfaRow(userId: string): Promise<MfaRow | null> {
  const rows = await query<MfaRow>(
    `SELECT id, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Checks a sign-in code: an authenticator code, or one recovery code (which is
 * then used up). Returns false for anything else.
 */
export async function checkSignInCode(userId: string, code: string): Promise<boolean> {
  const key = `signin:${userId}`;
  if (tooManyTries(key)) return false;
  const row = await getMfaRow(userId);
  if (!row?.mfa_enabled || !row.mfa_secret) return false;
  const secret = decryptField(row.mfa_secret);
  let ok = !!secret && verifyTotp(secret, code);
  if (!ok && row.mfa_recovery_codes) {
    try {
      const codes: string[] = JSON.parse(row.mfa_recovery_codes);
      const h = hashCode(code);
      const idx = codes.findIndex((c) => same(c, h));
      if (idx >= 0) {
        codes.splice(idx, 1);
        await query(`UPDATE users SET mfa_recovery_codes = $2 WHERE id = $1`, [userId, JSON.stringify(codes)]);
        ok = true;
      }
    } catch {
      ok = false;
    }
  }
  if (ok) clearFailures(key);
  else noteFailure(key);
  return ok;
}

export async function beginEnrolment(userId: string, account: string): Promise<{ secret: string; uri: string }> {
  const secret = newSecret();
  const stored = encryptField(secret);
  await query(`UPDATE users SET mfa_secret = $2, mfa_enabled = false WHERE id = $1`, [userId, stored]);
  return { secret, uri: otpauthUri(secret, account) };
}

/** Confirms the first code and switches MFA on. Returns the recovery codes, shown once. */
export async function finishEnrolment(userId: string, code: string): Promise<string[] | null> {
  const key = `enrol:${userId}`;
  if (tooManyTries(key)) return null;
  const row = await getMfaRow(userId);
  const secret = row?.mfa_secret ? decryptField(row.mfa_secret) : null;
  if (!secret || !verifyTotp(secret, code)) {
    noteFailure(key);
    return null;
  }
  clearFailures(key);
  const rec = newRecoveryCodes();
  await query(
    `UPDATE users SET mfa_enabled = true, mfa_enrolled_at = now(), mfa_recovery_codes = $2 WHERE id = $1`,
    [userId, rec.stored],
  );
  return rec.plain;
}

export async function switchOff(userId: string): Promise<void> {
  await query(
    `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_recovery_codes = NULL, mfa_enrolled_at = NULL WHERE id = $1`,
    [userId],
  );
}

/** Roles that must use MFA once the Managing Partner turns the requirement on. */
export const MFA_ROLES = ["managing_partner", "partner"];

/* ---------- the requirement switch ---------- */

export async function isMfaRequired(): Promise<boolean> {
  const rows = await query<{ metadata: { required?: boolean } | null }>(
    `SELECT metadata FROM reference_data WHERE type = 'system_setting' AND code = 'security' LIMIT 1`,
  );
  return rows[0]?.metadata?.required === true;
}

export async function setMfaRequired(required: boolean): Promise<void> {
  await query(
    `INSERT INTO reference_data (type, code, label, sort_order, is_active, metadata)
     VALUES ('system_setting', 'security', 'Security settings', 0, false, $1::jsonb)
     ON CONFLICT (type, code) DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()`,
    [JSON.stringify({ required })],
  );
}
