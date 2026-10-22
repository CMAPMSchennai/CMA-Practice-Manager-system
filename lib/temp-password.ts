/**
 * Admin-issued one-time passwords (requirements Gap #14, approved 2026-09-30).
 *
 * An admin creates or resets a staff login; the system generates a one-time
 * password that is shown to the admin once and shared privately. The user must
 * set their own password on first login, and the one-time password stops
 * working 24 hours after it is issued.
 *
 * State lives in the NextAuth `verification_token` table (the same table the
 * password-reset flow uses): a row with identifier `must-change-password:<userId>`
 * means the user still has to set their own password, and its `expires` is the
 * one-time password's expiry. Only the bcrypt hash of the password is stored.
 */
import { randomBytes, randomInt } from "crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { query } from "@/lib/db";

export const TEMP_PASSWORD_TTL_HOURS = 24;

/** No 0/O, 1/l/I — easy to read out or type from a message. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function identifierFor(userId: string): string {
  return `must-change-password:${userId}`;
}

export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export interface PasswordChangeState {
  required: boolean;
  expired: boolean;
  expiresAt: string | null;
}

export async function getPasswordChangeState(userId: string): Promise<PasswordChangeState> {
  const rows = await query<{ expires: string }>(
    `SELECT expires FROM verification_token
      WHERE identifier = $1
      ORDER BY expires DESC
      LIMIT 1`,
    [identifierFor(userId)],
  );
  if (rows.length === 0) return { required: false, expired: false, expiresAt: null };
  const expiresAt = rows[0].expires;
  return { required: true, expired: new Date(expiresAt).getTime() < Date.now(), expiresAt };
}

/**
 * Set a fresh one-time password for the user inside the caller's transaction.
 * Returns the plain-text password, which must only be shown to the admin once.
 */
export async function issueTempPassword(
  client: PoolClient,
  userId: string,
): Promise<{ password: string; expiresAt: string }> {
  const password = generateTempPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userId]);
  await client.query(`DELETE FROM verification_token WHERE identifier = $1`, [identifierFor(userId)]);
  await client.query(
    `INSERT INTO verification_token (identifier, token, expires) VALUES ($1, $2, $3)`,
    [identifierFor(userId), randomBytes(16).toString("hex"), expiresAt],
  );
  return { password, expiresAt };
}

/** Called once the user has set their own password. */
export async function clearPasswordChangeRequirement(client: PoolClient, userId: string): Promise<void> {
  await client.query(`DELETE FROM verification_token WHERE identifier = $1`, [identifierFor(userId)]);
}
