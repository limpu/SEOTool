"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import { FEATURE_CATALOG } from "@/lib/rbac/feature-catalog";
import type { PackageFeatureState } from "@/lib/rbac/package-admin";

type BillingPeriod = "monthly" | "yearly" | "one_time";
type PackageStatus = "active" | "inactive";

const BILLING_OPTIONS: { value: BillingPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_time", label: "One-time" },
];

function featuresFromStates(states: PackageFeatureState[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const f of FEATURE_CATALOG) {
    const found = states.find((s) => s.featureKey === f.key);
    state[f.key] = found?.enabled ?? false;
  }
  return state;
}

export function PackageForm({
  mode,
  pkg,
  initialFeatureStates,
}: {
  mode: "create" | "edit";
  pkg?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    billingPeriod: BillingPeriod;
    status: PackageStatus;
  };
  initialFeatureStates: PackageFeatureState[];
}) {
  const router = useRouter();

  const [name, setName] = useState(pkg?.name ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "0");
  const [currency, setCurrency] = useState(pkg?.currency ?? "USD");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(pkg?.billingPeriod ?? "monthly");
  const [status, setStatus] = useState<PackageStatus>(pkg?.status ?? "active");
  const [features, setFeatures] = useState<Record<string, boolean>>(() =>
    featuresFromStates(initialFeatureStates)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  function toggleFeature(key: string) {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = {
        name,
        description: description.trim().length > 0 ? description : undefined,
        price: Number(price),
        currency,
        billingPeriod,
        status,
      };
      const url = mode === "create" ? "/api/admin/packages" : `/api/admin/packages/${pkg!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(data.fieldErrors)) {
            if (Array.isArray(msgs) && msgs[0]) flat[key] = msgs[0] as string;
          }
          setErrors(flat);
        }
        setServerError(data.error ?? "Could not save this package.");
        return;
      }

      const packageId = mode === "create" ? data.package.id : pkg!.id;

      // Feature toggles are saved as a second call against the dedicated
      // sub-route — same two-step shape a create/edit form would need
      // anyway since a brand-new package has no id until it's created.
      const featureRes = await fetch(`/api/admin/packages/${packageId}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: FEATURE_CATALOG.map((f) => ({ featureKey: f.key, enabled: features[f.key] ?? false })),
        }),
      });
      if (!featureRes.ok) {
        const featureData = await featureRes.json().catch(() => ({}));
        setServerError(featureData.error ?? "Package saved, but feature toggles could not be saved.");
        return;
      }

      if (mode === "create") {
        router.push(`/admin/packages/${packageId}`);
      } else {
        setNotice("Package updated.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivateToggle() {
    if (!pkg) return;
    setServerError("");
    setDeactivateBusy(true);
    try {
      const nextActive = pkg.status !== "active";
      const res = nextActive
        ? await fetch(`/api/admin/packages/${pkg.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "active" }),
          })
        : await fetch(`/api/admin/packages/${pkg.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not update package status.");
        return;
      }
      router.refresh();
    } finally {
      setDeactivateBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="package-name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Package name
              </label>
              <Input id="package-name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
              <FieldError id="package-name-error" message={errors.name} />
            </div>
            <div>
              <label htmlFor="package-description" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Description
              </label>
              <textarea
                id="package-description"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label htmlFor="package-price" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                  Price
                </label>
                <Input
                  id="package-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  error={errors.price}
                />
                <FieldError id="package-price-error" message={errors.price} />
              </div>
              <div>
                <label htmlFor="package-currency" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                  Currency
                </label>
                <Input
                  id="package-currency"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  error={errors.currency}
                />
                <FieldError id="package-currency-error" message={errors.currency} />
              </div>
              <div>
                <label htmlFor="package-billing" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                  Billing period
                </label>
                <select
                  id="package-billing"
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value as BillingPeriod)}
                  className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
                >
                  {BILLING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="package-status" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                  Status
                </label>
                <select
                  id="package-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PackageStatus)}
                  className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Package features
          </h2>
          <p className="mb-4 text-xs text-muted">
            ON/OFF entitlement per feature, read from the same central feature catalog RBAC uses. This is
            what a subscriber&apos;s plan includes — not what their role lets them do (that&apos;s the
            separate Roles permission matrix).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FEATURE_CATALOG.map((feature) => (
              <label
                key={feature.key}
                className="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2 text-sm"
              >
                <span className="text-secondary-foreground">{feature.name}</span>
                <input
                  type="checkbox"
                  aria-label={feature.name}
                  checked={features[feature.key] ?? false}
                  onChange={() => toggleFeature(feature.key)}
                />
              </label>
            ))}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}>
            {mode === "create" ? "Create package" : "Save changes"}
          </Button>
          {mode === "edit" && pkg && (
            <Button
              type="button"
              variant="secondary"
              className={pkg.status === "active" ? "text-destructive hover:bg-destructive-subtle" : ""}
              onClick={handleDeactivateToggle}
              loading={deactivateBusy}
            >
              {pkg.status === "active" ? "Deactivate package" : "Activate package"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
