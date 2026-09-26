import { db } from "@/lib/db";
import { features, packages, packageFeatures, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { FEATURE_CATALOG } from "./feature-catalog";

/**
 * Phase 16 — Dynamic Subscription Packages (read-v2.md §11). Package
 * create/edit/activate/deactivate plus a simple per-feature ON/OFF toggle
 * grid, built the same way Phase 15's `role-admin.ts` built the role editor
 * on top of the RBAC tables: reuse the existing `features` catalog rather
 * than inventing a second feature list ("Feature availability must come
 * from the same feature catalog used by RBAC").
 *
 * Deliberately does NOT implement: numeric limits/quotas (Phase 17's
 * `limit_definitions`/`package_limits`), usage tracking, or entitlement
 * enforcement in any SEO/AI route. This file only makes packages
 * manageable and assignable.
 */

export type PackageSummary = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one_time";
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
};

export type PackageFeatureState = { featureKey: string; enabled: boolean };

export type PackageWithFeatures = {
  pkg: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    billingPeriod: "monthly" | "yearly" | "one_time";
    status: "active" | "inactive";
  };
  featureStates: PackageFeatureState[];
};

/** Package list for the /admin/packages screen, including how many users are currently assigned each package. */
export async function listPackagesWithCounts(): Promise<PackageSummary[]> {
  const packageRows = await db.select().from(packages).orderBy(packages.name);
  const countRows = await db
    .select({ packageId: users.subscriptionPackageId, count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.subscriptionPackageId} IS NOT NULL`)
    .groupBy(users.subscriptionPackageId);
  const countMap = new Map(countRows.map((r) => [r.packageId, r.count]));
  return packageRows.map((p) => ({ ...p, userCount: countMap.get(p.id) ?? 0 }));
}

/** A single package plus its full feature-toggle state, one row per catalog feature (even untoggled ones default to off). */
export async function getPackageWithFeatures(packageId: string): Promise<PackageWithFeatures | null> {
  const [pkg] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!pkg) return null;

  const rows = await db
    .select({ featureKey: features.key, enabled: packageFeatures.enabled })
    .from(packageFeatures)
    .innerJoin(features, eq(packageFeatures.featureId, features.id))
    .where(eq(packageFeatures.packageId, packageId));

  const enabledByFeature = new Map(rows.map((r) => [r.featureKey, r.enabled]));
  const featureStates: PackageFeatureState[] = FEATURE_CATALOG.map((f) => ({
    featureKey: f.key,
    enabled: enabledByFeature.get(f.key) ?? false,
  }));

  return { pkg, featureStates };
}

export type PackageInput = {
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly" | "one_time";
  status: "active" | "inactive";
};

export async function createPackage(
  input: PackageInput
): Promise<{ id: string; name: string }> {
  const [pkg] = await db
    .insert(packages)
    .values({
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      status: input.status,
    })
    .returning({ id: packages.id, name: packages.name });
  return pkg;
}

export type UpdatePackageResult = { ok: true } | { ok: false; error: string; status: number };

export async function updatePackage(
  packageId: string,
  input: PackageInput
): Promise<UpdatePackageResult> {
  const [existing] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!existing) return { ok: false, error: "Package not found.", status: 404 };

  await db
    .update(packages)
    .set({
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(packages.id, packageId));
  return { ok: true };
}

/**
 * Deactivates (never deletes) a package — read-v2.md §11 explicitly lists
 * "Activate, Deactivate", not "Delete". Users still holding this package via
 * `subscriptionPackageId` are left exactly as they are; the FK is untouched
 * and the row still exists, so nothing about their assignment breaks.
 */
export async function deactivatePackage(packageId: string): Promise<UpdatePackageResult> {
  const [existing] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!existing) return { ok: false, error: "Package not found.", status: 404 };

  await db
    .update(packages)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(packages.id, packageId));
  return { ok: true };
}

export async function activatePackage(packageId: string): Promise<UpdatePackageResult> {
  const [existing] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!existing) return { ok: false, error: "Package not found.", status: 404 };

  await db
    .update(packages)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(packages.id, packageId));
  return { ok: true };
}

/**
 * Replaces a package's entire feature-toggle set with exactly the given
 * states — same full-replace-not-diff approach `applyPermissionMatrix` uses
 * in Phase 15's role editor, for the same reason: the client always submits
 * the complete grid, so there's no ambiguity about what an omitted feature
 * means.
 */
export async function setPackageFeatures(
  packageId: string,
  states: PackageFeatureState[]
): Promise<UpdatePackageResult> {
  const [existing] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!existing) return { ok: false, error: "Package not found.", status: 404 };

  const featureRows = await db.select({ id: features.id, key: features.key }).from(features);
  const featureIdByKey = new Map(featureRows.map((f) => [f.key, f.id]));

  await db.delete(packageFeatures).where(eq(packageFeatures.packageId, packageId));

  const toInsert = states
    .filter((s) => featureIdByKey.has(s.featureKey))
    .map((s) => ({
      packageId,
      featureId: featureIdByKey.get(s.featureKey)!,
      enabled: s.enabled,
    }));

  if (toInsert.length > 0) {
    await db
      .insert(packageFeatures)
      .values(toInsert)
      .onConflictDoNothing({ target: [packageFeatures.packageId, packageFeatures.featureId] });
  }

  return { ok: true };
}
