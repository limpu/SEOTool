/**
 * Phase 34 (Production Readiness).
 *
 * Closes a gap Phase 32/33 both explicitly documented and deliberately did
 * NOT fix themselves: `cleanExpiredRateLimits()` (src/lib/auth/rate-limit.ts)
 * had its query logic fixed by Phase 32 (it was previously dead/inverted
 * and matched ~zero rows), but nothing in the codebase actually calls it —
 * Phase 32/33's own write-ups both flagged "wiring an actual scheduled
 * invocation" as Phase 34 (Production) territory, not their own.
 *
 * This script is the wiring: a tiny, standalone entrypoint an operator's
 * OS-level scheduler can invoke periodically (cron on Linux, Task
 * Scheduler on Windows, a Kubernetes CronJob, etc.) — deliberately NOT
 * baked into an API route or a background timer inside the Next.js
 * process itself, since a request-triggered or in-process-timer cleanup
 * would run at unpredictable/request-dependent intervals and would tie
 * DB cleanup work to web-request latency for no benefit. A real recurring
 * schedule (e.g. hourly) is a deployment-time/ops decision — see the
 * Production Readiness Checklist in read.md for exactly how to wire this
 * up in whichever environment this ships to.
 *
 * Usage:
 *   npx tsx scripts/cleanup-rate-limits.ts
 *
 * Exit code 0 on success, 1 on failure (so a cron wrapper can alert on
 * failure in the usual way).
 */
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  // Imported after dotenv.config() runs so DATABASE_URL (read at
  // module-load time by src/lib/db/index.ts's `new Pool({...})`) is
  // already populated — this script runs standalone via tsx, outside
  // Next.js's own automatic .env loading, so it must load .env itself
  // (same pattern drizzle.config.ts already uses for the same reason).
  const { cleanExpiredRateLimits } = await import("../src/lib/auth/rate-limit");
  const startedAt = Date.now();
  await cleanExpiredRateLimits();
  console.log(
    `[cleanup-rate-limits] Completed in ${Date.now() - startedAt}ms at ${new Date().toISOString()}`
  );
}

main()
  .then(async () => {
    const { pool } = await import("../src/lib/db");
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[cleanup-rate-limits] Failed:", err instanceof Error ? err.message : err);
    const { pool } = await import("../src/lib/db");
    await pool.end();
    process.exit(1);
  });
