"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { LimitDefinitionRow, PackageLimitRow } from "@/lib/rbac/limit-admin";

type PeriodType = "day" | "week" | "month" | "lifetime";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
  { value: "lifetime", label: "Lifetime (never resets)" },
];

/**
 * "Limitations" tab on /admin/packages/[id] (read.md §12's workflow: Select
 * Resource -> Set Value -> Set Period -> Save). Lists currently-assigned
 * limits with Edit/Remove, plus an Add-limit form below picking from any
 * limit_definitions not yet assigned to this package.
 */
export function PackageLimitsPanel({
  packageId,
  allDefinitions,
  initialLimits,
}: {
  packageId: string;
  allDefinitions: LimitDefinitionRow[];
  initialLimits: PackageLimitRow[];
}) {
  const router = useRouter();
  const [limits, setLimits] = useState<PackageLimitRow[]>(initialLimits);
  const [selectedDefId, setSelectedDefId] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [value, setValue] = useState("0");
  const [period, setPeriod] = useState<PeriodType>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const assignedIds = new Set(limits.map((l) => l.limitDefinitionId));
  const availableDefs = allDefinitions.filter((d) => d.active);

  async function refresh() {
    const res = await fetch(`/api/admin/packages/${packageId}/limits`);
    const data = await res.json();
    if (res.ok) setLimits(data.packageLimits);
  }

  async function handleAddOrEdit(e: FormEvent) {
    e.preventDefault();
    if (!selectedDefId) {
      setError("Select a resource first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/packages/${packageId}/limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limitDefinitionId: selectedDefId,
          limitValue: unlimited ? null : Number(value),
          periodType: period,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save this limit.");
        return;
      }
      setLimits(data.packageLimits);
      setSelectedDefId("");
      setUnlimited(false);
      setValue("0");
      setPeriod("month");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(l: PackageLimitRow) {
    setSelectedDefId(l.limitDefinitionId);
    setUnlimited(l.limitValue === null);
    setValue(l.limitValue === null ? "0" : String(l.limitValue));
    setPeriod(l.periodType);
  }

  async function handleRemove(limitDefinitionId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/packages/${packageId}/limits/${limitDefinitionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not remove this limit.");
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Limitations</h2>
      <p className="mb-4 text-xs text-muted">
        Numeric usage caps for this package. A resource with no row below is unlimited for this package.
        Leaving &quot;Unlimited&quot; checked stores <code>NULL</code>, not a magic number.
      </p>

      {error && (
        <div className="mb-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {limits.length > 0 ? (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-default text-xs uppercase text-muted">
                <th className="py-2 pr-4">Resource</th>
                <th className="py-2 pr-4">Limit</th>
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {limits.map((l) => (
                <tr key={l.id} className="border-b border-default">
                  <td className="py-2 pr-4">{l.limitName}</td>
                  <td className="py-2 pr-4">
                    {l.limitValue === null ? "Unlimited" : `${l.limitValue} ${l.unit}`}
                  </td>
                  <td className="py-2 pr-4 capitalize">{l.periodType}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button type="button" className="text-xs text-muted underline" onClick={() => startEdit(l)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-sm text-xs text-destructive underline hover:text-destructive-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        disabled={busy}
                        onClick={() => handleRemove(l.limitDefinitionId)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">No limits assigned yet — every resource is unlimited.</p>
      )}

      <form onSubmit={handleAddOrEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
        <div className="sm:col-span-2">
          <label htmlFor="limit-resource" className="mb-1.5 block text-xs font-medium text-secondary-foreground">
            Select resource
          </label>
          <select
            id="limit-resource"
            value={selectedDefId}
            onChange={(e) => setSelectedDefId(e.target.value)}
            className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
          >
            <option value="">Choose...</option>
            {availableDefs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {assignedIds.has(d.id) ? " (assigned)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="limit-value" className="mb-1.5 block text-xs font-medium text-secondary-foreground">
            Value
          </label>
          <Input
            id="limit-value"
            type="number"
            min={0}
            step="1"
            value={value}
            disabled={unlimited}
            onChange={(e) => setValue(e.target.value)}
          />
          <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            Unlimited
          </label>
        </div>
        <div>
          <label htmlFor="limit-period" className="mb-1.5 block text-xs font-medium text-secondary-foreground">
            Period
          </label>
          <select
            id="limit-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodType)}
            className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <Button type="submit" loading={busy}>
            Save limit
          </Button>
        </div>
      </form>
    </section>
  );
}
