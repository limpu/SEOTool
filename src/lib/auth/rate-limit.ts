import { db } from "@/lib/db";
import { rateLimitRecords } from "@/lib/db/schema";
import { and, eq, lt, or, isNull } from "drizzle-orm";

interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** How long to block after limit hit (seconds). Defaults to windowSeconds. */
  blockSeconds?: number;
}

export type RateLimitAction =
  | "register"
  | "check_email"
  | "login"
  | "verify_otp"
  | "resend_otp"
  | "forgot_password"
  | "reset_password"
  | "change_password"
  | "delete_account"
  | "update_profile"
  | "request_email_change"
  | "confirm_email_change"
  | "start_crawl"
  | "start_pagespeed"
  | "gsc_sync"
  | "ga4_report"
  | "start_ai_assessment"
  | "start_ai_content_gap"
  | "add_site_file"
  | "install_token";

const LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  register:         { limit: 5,  windowSeconds: 3600 },
  check_email:      { limit: 20, windowSeconds: 60 },
  login:            { limit: 10, windowSeconds: 900, blockSeconds: 900 },
  verify_otp:       { limit: 5,  windowSeconds: 600, blockSeconds: 600 },
  resend_otp:       { limit: 3,  windowSeconds: 300 },
  forgot_password:  { limit: 3,  windowSeconds: 3600 },
  reset_password:   { limit: 5,  windowSeconds: 3600 },
  change_password:  { limit: 5,  windowSeconds: 3600 },
  // Stage 5 — genuinely destructive, so kept as tight as change_password's
  // cap (same "re-enter your password" risk profile); a real successful
  // deletion consumes the user's own account so this limit only really
  // guards against repeated failed-password guesses against it.
  delete_account:   { limit: 5,  windowSeconds: 3600 },
  // Stage 3 — simple field updates, generous but bounded against scripted abuse.
  update_profile:   { limit: 20, windowSeconds: 3600 },
  // Same shape as resend_otp/verify_otp above — the email-change flow reuses
  // the exact same OTP infrastructure, so it gets the same conservative caps.
  request_email_change: { limit: 3,  windowSeconds: 3600 },
  confirm_email_change: { limit: 5,  windowSeconds: 600, blockSeconds: 600 },
  start_crawl:      { limit: 5,  windowSeconds: 3600 },
  // Lower than start_crawl — a PageSpeed batch launches two real Chrome
  // instances (mobile + desktop), each taking many seconds, materially
  // more expensive per-call than a crawl.
  start_pagespeed:  { limit: 3,  windowSeconds: 3600 },
  // GSC's own Search Analytics API has its own per-property quota; this is
  // just a courtesy cap against a user mashing "Sync now" repeatedly.
  gsc_sync:         { limit: 10, windowSeconds: 3600 },
  // GA4 reports are fetched live (no persisted history table yet — see
  // read.md Phase 36), so this route is called more often than GSC's
  // explicit "Sync now" button; capped generously against a user
  // repeatedly refreshing the Analytics page.
  ga4_report:       { limit: 30, windowSeconds: 3600 },
  // Phase 29 — AI calls carry real latency/local-compute cost even against
  // a local Ollama model; capped like start_pagespeed's real-Chrome-instance
  // reasoning above.
  start_ai_assessment:  { limit: 10, windowSeconds: 3600 },
  start_ai_content_gap: { limit: 10, windowSeconds: 3600 },
  // Phase 37 — manual-add fetches an arbitrary user-supplied URL through
  // `safeFetch`. Even fully SSRF-guarded, an unbounded endpoint that makes
  // outbound requests on demand is an open proxy and a way to have this
  // server hammer a third party, so it is capped like the other endpoints
  // that do real outbound work.
  add_site_file:    { limit: 20, windowSeconds: 3600 },
  // Web Installer Stage 1 — install-token submission. The token is the ONLY
  // thing standing between a not-yet-locked `/install` and an unauthenticated
  // remote admin-creation endpoint, so a brute-forceable token is not a token:
  // 43 base64url characters is 256 bits of entropy, but entropy only protects
  // you if guessing is expensive. Tightest cap in this table (tighter than
  // `login`, which at least has a password behind it) with a 15-minute block,
  // and — see `src/lib/install/rate-limit.ts` — a SUCCESSFUL verification
  // clears the counter, so an operator legitimately reloading the wizard never
  // locks themselves out while a guesser gets 5 attempts per quarter hour.
  install_token:    { limit: 5,  windowSeconds: 900, blockSeconds: 900 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Check and increment rate limit for a given key + action.
 * Key can be an IP address, user ID, or email — use the most specific identifier available.
 * Uses simple DB-backed sliding window; no Redis required.
 */
export async function checkRateLimit(
  key: string,
  action: RateLimitAction
): Promise<RateLimitResult> {
  const config = LIMITS[action];
  const now = new Date();
  const blockSeconds = config.blockSeconds ?? config.windowSeconds;

  // Check existing record
  const [existing] = await db
    .select()
    .from(rateLimitRecords)
    .where(and(eq(rateLimitRecords.key, key), eq(rateLimitRecords.action, action)))
    .limit(1);

  if (!existing) {
    // First attempt — create record
    await db.insert(rateLimitRecords).values({ key, action, attempts: 1, windowStart: now });
    return { allowed: true, remaining: config.limit - 1 };
  }

  // Check if currently blocked
  if (existing.blockedUntil && existing.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil(
      (existing.blockedUntil.getTime() - now.getTime()) / 1000
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  const windowStart = existing.windowStart;
  const windowEnd = new Date(windowStart.getTime() + config.windowSeconds * 1000);

  if (now > windowEnd) {
    // Window expired — reset
    await db
      .update(rateLimitRecords)
      .set({ attempts: 1, windowStart: now, blockedUntil: null })
      .where(and(eq(rateLimitRecords.key, key), eq(rateLimitRecords.action, action)));
    return { allowed: true, remaining: config.limit - 1 };
  }

  const newAttempts = existing.attempts + 1;

  if (newAttempts > config.limit) {
    // Exceeded — apply block
    const blockedUntil = new Date(now.getTime() + blockSeconds * 1000);
    await db
      .update(rateLimitRecords)
      .set({ attempts: newAttempts, blockedUntil })
      .where(and(eq(rateLimitRecords.key, key), eq(rateLimitRecords.action, action)));

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: blockSeconds,
    };
  }

  await db
    .update(rateLimitRecords)
    .set({ attempts: newAttempts })
    .where(and(eq(rateLimitRecords.key, key), eq(rateLimitRecords.action, action)));

  return { allowed: true, remaining: config.limit - newAttempts };
}

/**
 * Clean up expired rate limit records (call periodically — e.g. a cron/
 * scheduled task in a future ops phase; not currently wired into any
 * request path).
 *
 * Phase 32 fix: this previously deleted rows where `windowStart > now` —
 * backwards. `windowStart` is always set to `new Date()` at write time
 * (see `checkRateLimit` above), so it is never in the future; the
 * original condition matched effectively zero rows, meaning this function
 * silently did nothing and `rate_limit_records` would grow unbounded
 * forever (a real, if low-severity, resource-exhaustion/DB-bloat issue —
 * not an auth bypass, since `checkRateLimit` itself is correct and was
 * never affected by this bug). Fixed to delete rows whose *longest possible
 * relevant window* has definitely elapsed: either an expired block, or no
 * block and the window start is older than the largest configured window
 * across all actions (with a safety margin), which correctly covers every
 * action's real window without needing this cleanup query to know each
 * action's specific `windowSeconds`.
 */
export async function cleanExpiredRateLimits(): Promise<void> {
  const now = new Date();
  const maxWindowSeconds = Math.max(...Object.values(LIMITS).map((c) => Math.max(c.windowSeconds, c.blockSeconds ?? 0)));
  const safeStaleBefore = new Date(now.getTime() - (maxWindowSeconds + 3600) * 1000);

  await db
    .delete(rateLimitRecords)
    .where(
      or(
        lt(rateLimitRecords.blockedUntil, now),
        and(isNull(rateLimitRecords.blockedUntil), lt(rateLimitRecords.windowStart, safeStaleBefore))
      )
    );
}
