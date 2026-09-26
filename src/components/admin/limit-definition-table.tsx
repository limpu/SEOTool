"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import type { LimitDefinitionRow } from "@/lib/rbac/limit-admin";

type PeriodType = "day" | "week" | "month" | "lifetime";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "lifetime", label: "Lifetime" },
];

const emptyForm = { id: "", key: "", name: "", description: "", unit: "count", periodType: "month" as PeriodType };

/**
 * Minimal reference-table admin CRUD for /admin/limits — list + create/edit
 * + deactivate/activate. Deliberately lighter-weight than the Packages
 * screen: this is a flat catalog of "resources that can be limited", not a
 * multi-tab entity with its own nested feature grid.
 */
export function LimitDefinitionTable({ initialDefinitions }: { initialDefinitions: LimitDefinitionRow[] }) {
  const router = useRouter();
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setForm(emptyForm);
    setEditing(true);
    setErrors({});
    setServerError("");
  }

  function startEdit(d: LimitDefinitionRow) {
    setForm({
      id: d.id,
      key: d.key,
      name: d.name,
      description: d.description ?? "",
      unit: d.unit,
      periodType: d.periodType,
    });
    setEditing(true);
    setErrors({});
    setServerError("");
  }

  async function refresh() {
    const res = await fetch("/api/admin/limits");
    const data = await res.json();
    if (res.ok) setDefinitions(data.limitDefinitions);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError("");
    setBusy(true);
    try {
      const payload = {
        key: form.key,
        name: form.name,
        description: form.description.trim().length > 0 ? form.description : undefined,
        unit: form.unit,
        periodType: form.periodType,
        active: true,
      };
      const url = form.id ? `/api/admin/limits/${form.id}` : "/api/admin/limits";
      const method = form.id ? "PATCH" : "POST";
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
        setServerError(data.error ?? "Could not save this limit definition.");
        return;
      }
      setEditing(false);
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(d: LimitDefinitionRow) {
    setBusy(true);
    setServerError("");
    try {
      const res = d.active
        ? await fetch(`/api/admin/limits/${d.id}`, { method: "DELETE" })
        : await fetch(`/api/admin/limits/${d.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: true }),
          });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not update status.");
        return;
      }
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div className="flex justify-end">
        <Button type="button" onClick={startCreate}>
          + New limit definition
        </Button>
      </div>

      {editing && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {form.id ? "Edit limit definition" : "New limit definition"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ld-key" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Key
              </label>
              <Input
                id="ld-key"
                value={form.key}
                disabled={!!form.id}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                error={errors.key}
              />
              {errors.key && <p className="mt-1 text-xs text-destructive">{errors.key}</p>}
            </div>
            <div>
              <label htmlFor="ld-name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Name
              </label>
              <Input
                id="ld-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={errors.name}
              />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="ld-unit" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Unit
              </label>
              <Input id="ld-unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="ld-period" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Default period
              </label>
              <select
                id="ld-period"
                value={form.periodType}
                onChange={(e) => setForm((f) => ({ ...f, periodType: e.target.value as PeriodType }))}
                className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ld-description" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Description
              </label>
              <textarea
                id="ld-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Default period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.key}</TableCell>
                <TableCell>{d.name}</TableCell>
                <TableCell>{d.unit}</TableCell>
                <TableCell className="capitalize">{d.periodType}</TableCell>
                <TableCell>
                  {/* An enabled/disabled flag is chrome, not a measurement — it
                      never borrows a pass/fail status colour. */}
                  <Badge variant={d.active ? "accent" : "neutral"}>{d.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="rounded-sm text-xs text-muted underline hover:text-secondary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => startEdit(d)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`rounded-sm text-xs underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        d.active ? "text-destructive hover:text-destructive-hover" : "text-accent hover:text-accent-hover"
                      }`}
                      disabled={busy}
                      onClick={() => toggleActive(d)}
                    >
                      {d.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
