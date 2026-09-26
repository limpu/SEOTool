import { getAdminUserOrNull } from "./require-admin";
import type { PermissionAction } from "./feature-catalog";
import { db } from "@/lib/db";
import { features, packageFeatures, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkQuota } from "./quota";

/**
 * Phase 17 — `checkAccess()`, the three-gate orchestrator (read.md §14,
 * master doc Section 20.9). Runs, in order:
 *
 *   1. Authorization — "does this user's ROLE let them do this action at
 *      all." Reused as-is from Phase 15: `getAdminUserOrNull()`. Nothing
 *      reimplemented.
 *   2. Entitlement — "does this user's PACKAGE include this feature."
 *      Reused as-is from Phase 16's data model (`package_features`): a
 *      small inline query here, since Phase 16 never exported a standalone
 *      `packageHasFeature()` helper of its own (its UI only ever needed the
 *      full toggle grid via `getPackageWithFeatures`) — this is the first
 *      caller that needs a single feature's ON/OFF answer, so it's added
 *      here rather than growing package-admin.ts with a function only this
 *      file calls.
 *   3. Quota — "does this user have USAGE remaining." This phase's
 *      `checkQuota()`. Only run when the caller passes a `limitKey` — there
 *      is no feature<->limit mapping table (deliberately out of scope per
 *      the task brief: "make limit_key an optional/explicit parameter, keep
 *      it simple"), so the caller must know which limit (if any) applies to
 *      the action it's gating. A feature with no numeric quota (e.g. a
 *      binary ON/OFF feature like "GEO") is simply called with no
 *      `limitKey` and gate 3 is skipped entirely.
 *
 * Short-circuits on the first failing gate — cheaper (no need to compute
 * quota if the user isn't even entitled to the feature) and gives the
 * caller a precise, single `failedGate` to build a clear error message
 * from, matching the "For every feature request: AUTHORIZED? ENTITLED?
 * WITHIN LIMIT?" checklist in read.md's Final Project Rule.
 *
 * NOT wired into any existing SEO/AI route — per the task brief, this phase
 * only builds the orchestrator and its tests. Retrofitting Phase 6-13's
 * crawler/on-page/link/etc. routes to call this is explicitly deferred.
 */

export type AccessCheckResult = {
  allowed: boolean;
  reason?: string;
  failedGate?: "authorization" | "entitlement" | "quota";
};

export async function checkAccess(
  userId: string,
  featureKey: string,
  action: PermissionAction = "view",
  limitKey?: string
): Promise<AccessCheckResult> {
  // Gate 1: Authorization (Phase 15).
  const authorized = await getAdminUserOrNull(userId, featureKey, action);
  if (!authorized) {
    return { allowed: false, failedGate: "authorization", reason: "You do not have permission for this action." };
  }

  // Gate 2: Entitlement (Phase 16's package_features).
  const [user] = await db
    .select({ packageId: users.subscriptionPackageId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, failedGate: "authorization", reason: "User not found." };
  }

  if (user.packageId) {
    const [entitlementRow] = await db
      .select({ enabled: packageFeatures.enabled })
      .from(packageFeatures)
      .innerJoin(features, eq(packageFeatures.featureId, features.id))
      .where(and(eq(packageFeatures.packageId, user.packageId), eq(features.key, featureKey)))
      .limit(1);

    // No row for this feature on this package = not entitled. Unlike
    // package_limits (sparse = unlimited), package_features rows are always
    // fully written by `setPackageFeatures()`'s full-replace grid for every
    // catalog feature (Phase 16), so an absent row here means the feature
    // predates this package's last save and should fail closed, not open.
    if (!entitlementRow || !entitlementRow.enabled) {
      return {
        allowed: false,
        failedGate: "entitlement",
        reason: "Your subscription package does not include this feature.",
      };
    }
  } else {
    // No package assigned at all: no entitlement to anything package-gated.
    return { allowed: false, failedGate: "entitlement", reason: "No subscription package assigned." };
  }

  // Gate 3: Quota (this phase), only if the caller named a limit to check.
  if (limitKey) {
    const quota = await checkQuota(userId, limitKey);
    if (!quota.allowed) {
      return { allowed: false, failedGate: "quota", reason: quota.reason ?? "Usage limit reached." };
    }
  }

  return { allowed: true };
}
