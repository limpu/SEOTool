import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption at rest for Google OAuth tokens (access + refresh).
 *
 * Why encryption, not hashing: Phase 3's password-reset tokens
 * (`src/lib/auth/tokens.ts`) are SHA-256 *hashed* because the app only ever
 * needs to compare a user-supplied plaintext against the stored hash — it
 * never needs the original value back. A Google refresh token is the
 * opposite: this app must present the *original* token to Google on every
 * token-refresh call, so it must be recoverable, not just verifiable. That
 * requires real symmetric encryption, not a one-way hash.
 *
 * Key management: the 32-byte (256-bit) key is read from the
 * `GSC_TOKEN_ENCRYPTION_KEY` env var, base64-encoded, generated the same way
 * this codebase already generates `JWT_SECRET`:
 *   node -e "require('crypto').randomBytes(32).toString('base64')"
 * It is never derived from any other secret and never stored in the
 * database. Losing this key makes all stored GSC tokens permanently
 * undecryptable (the same "must be rotated with care" property as any
 * envelope-encryption key) — rotating it requires re-connecting every
 * website's Search Console integration, which is an acceptable tradeoff for
 * an MVP with no key-versioning scheme yet.
 *
 * Ciphertext format stored in the DB: `${ivBase64}:${authTagBase64}:${ciphertextBase64}`.
 * AES-GCM is authenticated (the auth tag detects tampering/corruption), and
 * a fresh random IV is generated per encryption call (GCM must never reuse
 * an IV under the same key).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV, the recommended size for GCM.

function getEncryptionKey(): Buffer {
  const raw = process.env.GSC_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "GSC_TOKEN_ENCRYPTION_KEY environment variable is not set. Generate one with: " +
        `node -e "require('crypto').randomBytes(32).toString('base64')"`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GSC_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). Regenerate with: ` +
        `node -e "require('crypto').randomBytes(32).toString('base64')"`
    );
  }
  return key;
}

/** Returns true if a usable encryption key is configured, without throwing. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token (expected iv:authTag:ciphertext).");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
