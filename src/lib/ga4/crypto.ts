import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption at rest for GA4 OAuth tokens — same algorithm,
 * ciphertext format, and key-management pattern as
 * `src/lib/gsc/crypto.ts` (Phase 26), deliberately duplicated rather than
 * shared: the user explicitly required GA4's tokens to be encrypted with an
 * INDEPENDENT key (`GA4_TOKEN_ENCRYPTION_KEY`, not `GSC_TOKEN_ENCRYPTION_KEY`)
 * so that rotating one integration's key never requires touching, or risks
 * breaking, the other's stored tokens. Generate with:
 *   node -e "require('crypto').randomBytes(32).toString('base64')"
 *
 * Ciphertext format stored in the DB: `${ivBase64}:${authTagBase64}:${ciphertextBase64}`.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV, the recommended size for GCM.

function getEncryptionKey(): Buffer {
  const raw = process.env.GA4_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "GA4_TOKEN_ENCRYPTION_KEY environment variable is not set. Generate one with: " +
        `node -e "require('crypto').randomBytes(32).toString('base64')"`
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GA4_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). Regenerate with: ` +
        `node -e "require('crypto').randomBytes(32).toString('base64')"`
    );
  }
  return key;
}

/** Returns true if a usable encryption key is configured, without throwing. */
export function isGa4TokenEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptGa4Token(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptGa4Token(stored: string): string {
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
