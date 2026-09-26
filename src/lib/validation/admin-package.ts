import { z } from "zod";
import { FEATURE_KEYS } from "@/lib/rbac/feature-catalog";

const featureKeyEnum = z.enum(FEATURE_KEYS as [string, ...string[]]);

// A currency code is deliberately kept a free 3-letter string rather than a
// fixed ISO-4217 enum — the master doc names no fixed currency list, and a
// closed enum would need a migration every time a new currency is wanted.
// Uppercase + exactly 3 letters is enough to keep the column meaningful.
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code (e.g. USD)."));

export const packageFormSchema = z.object({
  name: z.string().min(1, "Please enter a package name.").max(255, "Package name is too long.").trim(),
  description: z
    .string()
    .max(2000, "Description is too long.")
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  price: z
    .number({ error: "Please enter a price." })
    .min(0, "Price cannot be negative.")
    .max(1_000_000, "Price is too large."),
  currency: currencySchema.default("USD"),
  billingPeriod: z.enum(["monthly", "yearly", "one_time"]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type PackageFormInput = z.infer<typeof packageFormSchema>;

// Package Feature Management (read-v2.md §11): a simple ON/OFF toggle per
// catalog feature — entitlement, not the action-level permission matrix
// Phase 15 built for roles. Only catalog feature keys are accepted, same
// closed-set principle as `roleFormSchema`.
const featureToggleSchema = z.object({
  featureKey: featureKeyEnum,
  enabled: z.boolean(),
});

export const packageFeaturesFormSchema = z.object({
  features: z.array(featureToggleSchema),
});

export type PackageFeaturesFormInput = z.infer<typeof packageFeaturesFormSchema>;

export const assignPackageSchema = z.object({
  packageId: z.preprocess(
    (v) => (typeof v === "string" && v.length === 0 ? null : v),
    z.string().uuid("Invalid package id.").nullable().optional()
  ).transform((v) => v ?? null),
});
