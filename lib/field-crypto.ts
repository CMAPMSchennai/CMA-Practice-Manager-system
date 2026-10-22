/**
 * Field-level encryption (NFR: "PAN, Aadhaar, bank details and salary fields
 * encrypted at field level"). AES-256-GCM in the application, so the database
 * only ever holds ciphertext.
 *
 * The key comes from the FIELD_ENCRYPTION_KEY environment variable (32 random
 * bytes, base64). It is never stored in code or in the database. Losing it makes
 * encrypted values unrecoverable, so the Managing Partner keeps an offline copy
 * (Gap #39).
 *
 * Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64 parts). Values without
 * the prefix are treated as legacy plain text and returned unchanged.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      "Encryption is not set up yet. The Managing Partner must add the encryption key before PAN, Aadhaar, bank or salary details can be saved.",
    );
    this.name = "EncryptionKeyMissingError";
  }
}

interface Keys {
  enc: Buffer;
  mac: Buffer;
}

let cachedKeys: Keys | null = null;

function loadKeys(): Keys | null {
  if (cachedKeys) return cachedKeys;
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) {
    console.error("[field-crypto] FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return null;
  }
  // Separate sub-keys for encryption and for fingerprints.
  cachedKeys = {
    enc: Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "cma-pms field encryption v1", 32)),
    mac: Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "cma-pms field fingerprint v1", 32)),
  };
  return cachedKeys;
}

export function isEncryptionConfigured(): boolean {
  return loadKeys() !== null;
}

/**
 * Why encryption is or isn't active — for the Settings status card. Never
 * reveals the key: "missing" (not reaching the app), "invalid" (present but
 * not 32 bytes of base64, e.g. wrapped in quotes or truncated), or "active".
 */
export function encryptionKeyStatus(): { state: "active" | "missing" | "invalid"; length?: number } {
  if (loadKeys()) return { state: "active" };
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!raw) return { state: "missing" };
  return { state: "invalid", length: raw.length };
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypt a value for storage. Empty input stores null. Throws when no key is set. */
export function encryptField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const keys = loadKeys();
  if (!keys) throw new EncryptionKeyMissingError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.enc, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a stored value. Plain (legacy) values pass through; unreadable values return null. */
export function decryptField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text.startsWith(PREFIX)) return text;
  const keys = loadKeys();
  if (!keys) return null;
  try {
    const [ivB64, tagB64, ctB64] = text.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", keys.enc, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    console.error("[field-crypto] a stored value could not be decrypted");
    return null;
  }
}

/**
 * One-way fingerprint for duplicate checks on encrypted identifiers (e.g. "this
 * PAN already exists"). Normalised so spacing and case don't matter.
 * Returns null for empty input or when no key is set.
 */
export function fingerprint(kind: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalised = String(value).toUpperCase().replace(/[\s-]/g, "");
  if (!normalised) return null;
  const keys = loadKeys();
  if (!keys) return null;
  return createHmac("sha256", keys.mac).update(`${kind}:${normalised}`).digest("hex");
}
