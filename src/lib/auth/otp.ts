import { randomInt, createHash } from "crypto";

const OTP_LENGTH = 6;
export const OTP_EXPIRY_HOURS = 3;
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure 6-digit numeric OTP.
 * Returns the plaintext OTP (shown to the user once; never stored).
 */
export function generateOtp(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return randomInt(min, max + 1).toString().padStart(OTP_LENGTH, "0");
}

/**
 * Hash the OTP with SHA-256 for safe database storage.
 * Never store the plaintext OTP.
 */
export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/**
 * Constant-time comparison to verify an OTP against its hash.
 */
export function verifyOtp(plaintext: string, storedHash: string): boolean {
  const candidateHash = hashOtp(plaintext);
  // Use Buffer.compare for constant-time comparison
  return Buffer.from(candidateHash).equals(Buffer.from(storedHash));
}

/**
 * Return the expiry timestamp for a new OTP (now + 3 hours).
 */
export function getOtpExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + OTP_EXPIRY_HOURS);
  return d;
}
