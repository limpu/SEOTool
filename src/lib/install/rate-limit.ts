import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitRecords } from "@/lib/db/schema";
import { checkRateLimit, type RateLimitResult } from "@/lib/auth/rate-limit";

/**
 * Web Installer — rate limiting for install-token submission.
 *
 * Wraps the project's existing DB-backed limiter (`src/lib/auth/rate-limit.ts`,
 * action `install_token`) with two installer-specific behaviours that the
 * shared limiter should not have:
 *
 * 1. AN IN-MEMORY FALLBACK WHEN THE DATABASE IS DOWN.
 *    Every other rate-limited endpoint in this product can simply fail when
 *    the database is unreachable — none of them are reachable without it
 *    anyway. The installer is the exception: diagnosing a broken
 *    `DATABASE_URL` is one of its main jobs, so it must keep answering while
 *    the database is gone. That means the token check keeps running with the
 *    database down, which means brute-force protection must keep running too.
 *    Falling back to no limit would hand an attacker an unlimited-guess
 *    window that they could create by taking the database offline. The
 *    fallback is per-process and lost on restart — genuinely weaker than the
 *    DB-backed limiter, and only ever used when the strong one cannot run.
 *
 * 2. CLEARING THE COUNTER ON SUCCESS.
 *    The Stage 2 wizard sends the token on every request, so charging the
 *    budget for legitimate use would lock out the real operator in about five
 *    page loads. Successful verification therefore resets the counter, and
 *    only wrong guesses accumulate. This is the correct shape for a
 *    capability token: the limit exists to make guessing expensive, not to
 *    ration correct use.
 */

const FALLBACK_LIMIT = 5;
const FALLBACK_WINDOW_MS = 15 * 60 * 1000;

interface FallbackEntry {
  attempts: number;
  windowStart: number;
}
const fallbackBuckets = new Map<string, FallbackEntry>();

function fallbackCheck(key: string, now = Date.now()): RateLimitResult {
  const existing = fallbackBuckets.get(key);
  if (!existing || now - existing.windowStart > FALLBACK_WINDOW_MS) {
    fallbackBuckets.set(key, { attempts: 1, windowStart: now });
    return { allowed: true, remaining: FALLBACK_LIMIT - 1 };
  }
  existing.attempts += 1;
  if (existing.attempts > FALLBACK_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(
        (existing.windowStart + FALLBACK_WINDOW_MS - now) / 1000
      ),
    };
  }
  return { allowed: true, remaining: FALLBACK_LIMIT - existing.attempts };
}

export interface InstallRateLimitOutcome extends RateLimitResult {
  /** True when the weaker in-process limiter had to be used. */
  degraded: boolean;
}

/** Consume one attempt from the install-token budget for `key` (usually an IP). */
export async function checkInstallTokenRateLimit(
  key: string
): Promise<InstallRateLimitOutcome> {
  try {
    const result = await checkRateLimit(key, "install_token");
    return { ...result, degraded: false };
  } catch {
    return { ...fallbackCheck(key), degraded: true };
  }
}

/**
 * Give the budget back after a CORRECT token. See reason 2 above. Best-effort:
 * a failure here must never turn a successful verification into an error.
 */
export async function clearInstallTokenRateLimit(key: string): Promise<void> {
  fallbackBuckets.delete(key);
  try {
    await db
      .delete(rateLimitRecords)
      .where(
        and(eq(rateLimitRecords.key, key), eq(rateLimitRecords.action, "install_token"))
      );
  } catch {
    // Database unreachable — the in-memory bucket above is already cleared,
    // which is the only one in play in that situation.
  }
}

/** Test-only: drop the in-process fallback buckets between cases. */
export function __resetInstallRateLimitFallbackForTests() {
  fallbackBuckets.clear();
}
