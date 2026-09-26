import { randomBytes, createHash } from "crypto";

export const RESET_TOKEN_EXPIRY_HOURS = 1;

/**
 * Generate a cryptographically secure password reset token.
 * Returns { plaintext, hash }.
 * Store only the hash; send only the plaintext to the user (via email).
 */
export function generateResetToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

/**
 * Hash a reset token for database lookup.
 */
export function hashResetToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Return the expiry timestamp for a new reset token (now + 1 hour).
 */
export function getResetTokenExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + RESET_TOKEN_EXPIRY_HOURS);
  return d;
}
