import { db } from "@/lib/db";
import { limitDefinitions, packageLimits, packages } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { LIMIT_DEFINITION_CATALOG } from "./limit-catalog";

/**
 * Phase 17 — Limitation Management (read.md §12). CRUD helpers for
 * `limit_definitions` (the reference table of quota "resources") and
 * `package_limits` (a per-package numeric value + period assigned against
 * one of those resources), mirroring `package-admin.ts`'s function
 * signatures/style/error-handling exactly.
 *
 * Unlike `FEATURE_CATALOG` (a static, code-only registry — see
 * feature-catalog.ts), `limit_definitions` is DB-backed with a light admin
 * CRUD UI. This is a deliberate difference: limits need per-package numeric
 * values assigned dynamically by non-developers (an admin defining "PRO gets
 * 50 audits/month"), so the catalog of *what can be limited* has to be
 * editable at runtime too, not just the *value* assigned to a package.
 */

export type LimitDefinitionRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  unit: string;
  periodType: "day" | "week" | "month" | "lifetime";
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Idempotently seeds LIMIT_DEFINITION_CATALOG into limit_definitions, same pattern as ensureRbacSeed(). */
export async function ensureLimitCatalogSeed(): Promise<void> {
  for (const l of LIMIT_DEFINITION_CATALOG) {
    await db
      .insert(limitDefinitions)
      .values({
        key: l.key,
        name: l.name,
        description: l.description,
        unit: l.unit,
        periodType: l.periodType,
      })
      .onConflictDoUpdate({
        target: limitDefinitions.key,
        set: { name: l.name, description: l.description, unit: l.unit, updatedAt: new Date() },
      });
  }
}

export async function listLimitDefinitions(): Promise<LimitDefinitionRow[]> {
  return db.select().from(limitDefinitions).orderBy(limitDefinitions.name);
}

export async function getLimitDefinition(id: string): Promise<LimitDefinitionRow | null> {
  const [row] = await db.select().from(limitDefinitions).where(eq(limitDefinitions.id, id)).limit(1);
  return row ?? null;
}

export type LimitDefinitionInput = {
  key: string;
  name: string;
  description: string | null;
  unit: string;
  periodType: "day" | "week" | "month" | "lifetime";
  active: boolean;
};

export async function createLimitDefinition(
  input: LimitDefinitionInput
): Promise<{ id: string; key: string }> {
  const [row] = await db
    .insert(limitDefinitions)
    .values(input)
    .returning({ id: limitDefinitions.id, key: limitDefinitions.key });
  return row;
}

export type UpdateLimitResult = { ok: true } | { ok: false; error: string; status: number };

export async function updateLimitDefinition(
  id: string,
  input: LimitDefinitionInput
): Promise<UpdateLimitResult> {
  const [existing] = await db.select().from(limitDefinitions).where(eq(limitDefinitions.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Limit definition not found.", status: 404 };

  await db
    .update(limitDefinitions)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(limitDefinitions.id, id));
  return { ok: true };
}

/** Deactivates (never deletes) a limit definition — same "deactivate not delete" convention as packages. */
export async function deactivateLimitDefinition(id: string): Promise<UpdateLimitResult> {
  const [existing] = await db.select().from(limitDefinitions).where(eq(limitDefinitions.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Limit definition not found.", status: 404 };

  await db.update(limitDefinitions).set({ active: false, updatedAt: new Date() }).where(eq(limitDefinitions.id, id));
  return { ok: true };
}

export async function activateLimitDefinition(id: string): Promise<UpdateLimitResult> {
  const [existing] = await db.select().from(limitDefinitions).where(eq(limitDefinitions.id, id)).limit(1);
  if (!existing) return { ok: false, error: "Limit definition not found.", status: 404 };

  await db.update(limitDefinitions).set({ active: true, updatedAt: new Date() }).where(eq(limitDefinitions.id, id));
  return { ok: true };
}

// ─── Package Limits (assigning a numeric value + period to a package) ───────

export type PackageLimitRow = {
  id: string;
  limitDefinitionId: string;
  limitKey: string;
  limitName: string;
  unit: string;
  limitValue: number | null;
  periodType: "day" | "week" | "month" | "lifetime";
};

/** All limits assigned to a package, joined with their definition for display. Package_limits with no row for a definition simply don't appear (no implicit "unlimited" row is fabricated — absence just means this package has no explicit limit set for that resource yet). */
export async function listPackageLimits(packageId: string): Promise<PackageLimitRow[]> {
  const rows = await db
    .select({
      id: packageLimits.id,
      limitDefinitionId: packageLimits.limitDefinitionId,
      limitKey: limitDefinitions.key,
      limitName: limitDefinitions.name,
      unit: limitDefinitions.unit,
      limitValue: packageLimits.limitValue,
      periodType: packageLimits.periodType,
    })
    .from(packageLimits)
    .innerJoin(limitDefinitions, eq(packageLimits.limitDefinitionId, limitDefinitions.id))
    .where(eq(packageLimits.packageId, packageId))
    .orderBy(limitDefinitions.name);
  return rows;
}

export type SetPackageLimitInput = {
  limitDefinitionId: string;
  limitValue: number | null; // NULL = unlimited
  periodType: "day" | "week" | "month" | "lifetime";
};

/** Upserts (Select Resource -> Set Value -> Set Period -> Save, read.md §12) one package_limits row. */
export async function setPackageLimit(
  packageId: string,
  input: SetPackageLimitInput
): Promise<UpdateLimitResult> {
  const [pkg] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1);
  if (!pkg) return { ok: false, error: "Package not found.", status: 404 };

  const [def] = await db
    .select()
    .from(limitDefinitions)
    .where(eq(limitDefinitions.id, input.limitDefinitionId))
    .limit(1);
  if (!def) return { ok: false, error: "Limit definition not found.", status: 404 };

  await db
    .insert(packageLimits)
    .values({
      packageId,
      limitDefinitionId: input.limitDefinitionId,
      limitValue: input.limitValue,
      periodType: input.periodType,
    })
    .onConflictDoUpdate({
      target: [packageLimits.packageId, packageLimits.limitDefinitionId],
      set: { limitValue: input.limitValue, periodType: input.periodType, updatedAt: new Date() },
    });
  return { ok: true };
}

/** Removes a package's assigned limit for one resource — the resource reverts to "no explicit limit row" (see checkQuota's no-row handling in quota.ts). */
export async function removePackageLimit(packageId: string, limitDefinitionId: string): Promise<UpdateLimitResult> {
  const result = await db
    .delete(packageLimits)
    .where(
      sql`${packageLimits.packageId} = ${packageId} AND ${packageLimits.limitDefinitionId} = ${limitDefinitionId}`
    )
    .returning({ id: packageLimits.id });
  if (result.length === 0) {
    return { ok: false, error: "Package limit not found.", status: 404 };
  }
  return { ok: true };
}
