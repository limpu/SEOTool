/**
 * Stage 2 (User Dashboard & Account Self-Service) — package upgrade REQUEST
 * flow. Deliberately not a payment/billing flow (per the project's zero
 * payment-processing rule): a user submits a request naming a different
 * ACTIVE package; it is written as a `pending` row in Stage 1's
 * `package_upgrade_requests` table. No admin-approval logic lives here yet
 * (that's Stage 2.5/3 per the task's own phasing) — this module only covers
 * submission + the active-package picklist a user needs to choose from.
 */

import { db } from "@/lib/db";
import { packages, packageUpgradeRequests, users } from "@/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";

export type ActivePackageOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one_time";
};

/** Every active package OTHER than the user's current one — the picklist for the "Update" modal. */
export async function listOtherActivePackages(currentPackageId: string | null): Promise<ActivePackageOption[]> {
  const rows = await db
    .select({
      id: packages.id,
      name: packages.name,
      description: packages.description,
      price: packages.price,
      currency: packages.currency,
      billingPeriod: packages.billingPeriod,
    })
    .from(packages)
    .where(
      currentPackageId
        ? and(eq(packages.status, "active"), ne(packages.id, currentPackageId))
        : eq(packages.status, "active")
    )
    .orderBy(packages.name);
  return rows;
}

export class DuplicatePendingRequestError extends Error {
  constructor() {
    super("You already have a pending upgrade request. Please wait for it to be resolved before submitting another.");
    this.name = "DuplicatePendingRequestError";
  }
}

export class InvalidRequestedPackageError extends Error {
  constructor() {
    super("The requested package is not a valid, active package.");
    this.name = "InvalidRequestedPackageError";
  }
}

/**
 * Submits a real upgrade request row. Refuses (rather than silently
 * no-opping) if the user already has a pending request, and validates the
 * requested package is a real, currently-active package — never trusts the
 * client-submitted id blindly.
 */
export async function submitUpgradeRequest(userId: string, requestedPackageId: string) {
  const [user] = await db
    .select({ id: users.id, packageId: users.subscriptionPackageId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    throw new Error("User not found.");
  }

  const [requestedPkg] = await db
    .select({ id: packages.id, status: packages.status })
    .from(packages)
    .where(eq(packages.id, requestedPackageId))
    .limit(1);
  if (!requestedPkg || requestedPkg.status !== "active") {
    throw new InvalidRequestedPackageError();
  }

  const [existingPending] = await db
    .select({ id: packageUpgradeRequests.id })
    .from(packageUpgradeRequests)
    .where(and(eq(packageUpgradeRequests.userId, userId), eq(packageUpgradeRequests.status, "pending")))
    .orderBy(desc(packageUpgradeRequests.createdAt))
    .limit(1);
  if (existingPending) {
    throw new DuplicatePendingRequestError();
  }

  const [created] = await db
    .insert(packageUpgradeRequests)
    .values({ userId, currentPackageId: user.packageId, requestedPackageId })
    .returning();
  return created;
}
