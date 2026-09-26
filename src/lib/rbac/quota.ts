import { db } from "@/lib/db";
import { packageLimits, limitDefinitions, usageRecords, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Phase 17 — Quota gate (read.md §13/§14). Pure period-window math plus the
 * two functions that read/write `usage_records` against a user's currently
 * assigned package's `package_limits`.
 *
 * Usage-recording strategy: **upsert-per-period**, not insert-per-event.
 * `usage_records` carries a unique(user_id, metric_key, period_start)
 * constraint (schema/index.ts) and `recordUsage()` does an
 * increment-on-conflict upsert against that key, rather than inserting one
 * row per usage event. Tradeoff, documented per the task brief:
 *   - Chosen (upsert-per-period): row count stays O(users x metrics x
 *     periods) instead of growing with every single tracked action —
 *     cheap for `checkQuota()` (a single indexed row lookup, no SUM/GROUP BY
 *     needed) and avoids unbounded table growth for high-frequency metrics
 *     like "AI requests". This is the right tradeoff for a live quota gate
 *     that's read on every gated request.
 *   - Not chosen (insert-per-event): one row per usage event would give a
 *     full audit trail (exactly when each unit of usage happened) at the
 *     cost of a SUM(...) aggregation on every checkQuota() call and
 *     unbounded row growth. Nothing in this phase's remit asks for a
 *     per-event audit log (Phase 15's Known Limitations already accepted
 *     "no audit trail" for the permission matrix on the same reasoning), so
 *     the cheaper, read-optimized shape was chosen.
 */

export type PeriodType = "day" | "week" | "month" | "lifetime";

export type PeriodWindow = { start: Date; end: Date };

/**
 * Pure function: computes the current period's [start, end) window for a
 * given period type, anchored at `now` (defaults to `new Date()`).
 *
 * - "day": midnight today (local server time) -> midnight tomorrow.
 * - "week": Monday 00:00 of the current week -> the following Monday 00:00.
 *   ISO-8601 week start (Monday), not Sunday — chosen as the one
 *   unambiguous convention when no locale is specified anywhere in this
 *   project's requirements.
 * - "month": the 1st of the current calendar month 00:00 -> the 1st of next
 *   month 00:00. Computed via `new Date(y, m+1, 1)`, which JS Date correctly
 *   rolls over across year boundaries (month 12 -> next year, month 0) and
 *   is unaffected by leap years since it never depends on a day count.
 * - "lifetime": a fixed epoch start (1970-01-01) -> a far-future end
 *   (9999-12-31), i.e. "all time" — never actually resets. `usage_records`
 *   for a lifetime metric always upserts against the same single
 *   `periodStart`, so usage keeps accumulating forever rather than
 *   resetting on any cadence, matching "Maximum Websites"/"Maximum Team
 *   Members"-style caps that are total-ever counts, not per-cycle ones.
 */
export function getCurrentPeriodWindow(periodType: PeriodType, now: Date = new Date()): PeriodWindow {
  switch (periodType) {
    case "day": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { start, end };
    }
    case "week": {
      const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
      const daysSinceMonday = (day + 6) % 7; // Monday -> 0, Sunday -> 6
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      return { start, end };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
    case "lifetime": {
      return { start: new Date(Date.UTC(1970, 0, 1)), end: new Date(Date.UTC(9999, 11, 31)) };
    }
  }
}

export type QuotaCheckResult = {
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  reason?: string;
};

/**
 * The Quota gate. Looks up the user's assigned package, that package's
 * limit row for `limitKey`, this period's usage, and compares.
 *
 * Design decisions (documented per the task brief):
 * - **No package assigned -> deny (not zero-limit-looks-the-same, but not
 *   silently unlimited either).** `allowed: false` with a distinguishing
 *   `reason`, so a caller can tell "you have no plan" apart from "you're
 *   over your plan's limit" apart from "unlimited". Chosen because a user
 *   with no package is the Phase 16 "brand new signup" state, not an
 *   authorized-and-plan-less power user — defaulting that state to
 *   unlimited would silently grant unmetered usage to exactly the accounts
 *   least vetted to have it.
 * - **No package_limits row for this limitKey on the user's package ->
 *   allowed, unlimited.** A package that never had this resource's limit
 *   set is treated the same as "this package doesn't cap this resource" —
 *   consistent with `package_limits` being sparse-by-design (see
 *   limit-admin.ts's `listPackageLimits` comment): an admin who never adds
 *   a "Maximum Reports" row for FREE didn't necessarily mean "cap it at
 *   zero", they meant "I haven't set a cap." A real cap requires an
 *   explicit row; NULL `limitValue` and "row absent" both mean unlimited by
 *   this convention, only maybeLimit-value NULL is the officially
 *   documented "unlimited" representation for a row that DOES exist.
 * - **NULL `limitValue` -> always allowed, unlimited: true, regardless of
 *   usage.** The core "NULL means unlimited" decision from Phase 1
 *   Research / read.md §12.
 */
export async function checkQuota(userId: string, limitKey: string): Promise<QuotaCheckResult> {
  const [user] = await db
    .select({ packageId: users.subscriptionPackageId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, limit: null, used: 0, remaining: null, unlimited: false, reason: "User not found." };
  }
  if (!user.packageId) {
    return {
      allowed: false,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: false,
      reason: "No subscription package assigned.",
    };
  }

  const [limitRow] = await db
    .select({
      limitValue: packageLimits.limitValue,
      periodType: packageLimits.periodType,
    })
    .from(packageLimits)
    .innerJoin(limitDefinitions, eq(packageLimits.limitDefinitionId, limitDefinitions.id))
    .where(and(eq(packageLimits.packageId, user.packageId), eq(limitDefinitions.key, limitKey)))
    .limit(1);

  if (!limitRow) {
    return { allowed: true, limit: null, used: 0, remaining: null, unlimited: true, reason: "No limit configured for this resource." };
  }

  if (limitRow.limitValue === null) {
    return { allowed: true, limit: null, used: 0, remaining: null, unlimited: true };
  }

  const window = getCurrentPeriodWindow(limitRow.periodType as PeriodType);
  const [usageRow] = await db
    .select({ usageValue: usageRecords.usageValue })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.metricKey, limitKey),
        eq(usageRecords.periodStart, window.start)
      )
    )
    .limit(1);

  const used = usageRow?.usageValue ?? 0;
  const remaining = Math.max(limitRow.limitValue - used, 0);
  const allowed = used < limitRow.limitValue;

  return {
    allowed,
    limit: limitRow.limitValue,
    used,
    remaining,
    unlimited: false,
    ...(allowed ? {} : { reason: `Usage limit reached (${used}/${limitRow.limitValue}).` }),
  };
}

/**
 * Records usage against the current period window for (userId, metricKey),
 * upserting (increment on conflict) per the file-level tradeoff comment
 * above. `periodType` must be supplied by the caller — quota.ts has no
 * opinion of its own about which period a metric uses; callers look it up
 * from the user's package_limits (or fall back to "month" if none is
 * configured, since usage can still be tracked even before an admin sets a
 * cap for it).
 */
export async function recordUsage(
  userId: string,
  metricKey: string,
  amount: number,
  periodType: PeriodType = "month",
  packageId: string | null = null
): Promise<void> {
  const window = getCurrentPeriodWindow(periodType);

  await db
    .insert(usageRecords)
    .values({
      userId,
      packageId,
      metricKey,
      usageValue: amount,
      periodStart: window.start,
      periodEnd: window.end,
    })
    .onConflictDoUpdate({
      target: [usageRecords.userId, usageRecords.metricKey, usageRecords.periodStart],
      set: {
        usageValue: sql`${usageRecords.usageValue} + ${amount}`,
        updatedAt: new Date(),
      },
    });
}
