"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import { FEATURE_CATALOG, PERMISSION_ACTIONS, type PermissionAction } from "@/lib/rbac/feature-catalog";
import type { FeatureGrant } from "@/lib/rbac/role-admin";

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
};

type MatrixState = Record<string, Set<PermissionAction>>;

function matrixFromGrants(grants: FeatureGrant[]): MatrixState {
  const state: MatrixState = {};
  for (const f of FEATURE_CATALOG) {
    const grant = grants.find((g) => g.featureKey === f.key);
    state[f.key] = new Set(grant?.actions ?? []);
  }
  return state;
}

function matrixToPayload(state: MatrixState): FeatureGrant[] {
  return FEATURE_CATALOG.map((f) => ({ featureKey: f.key, actions: Array.from(state[f.key] ?? []) }));
}

export function RoleForm({
  mode,
  role,
  initialGrants,
}: {
  mode: "create" | "edit";
  role?: { id: string; name: string; description: string | null; key: string; isSystem: boolean };
  initialGrants: FeatureGrant[];
}) {
  const router = useRouter();
  const isSuperAdmin = role?.key === "SUPER_ADMIN";
  const readOnly = isSuperAdmin;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [matrix, setMatrix] = useState<MatrixState>(() => matrixFromGrants(initialGrants));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function toggle(featureKey: string, action: PermissionAction) {
    if (readOnly) return;
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[featureKey]);
      if (set.has(action)) set.delete(action);
      else set.add(action);
      next[featureKey] = set;
      return next;
    });
  }

  function toggleRow(featureKey: string, checked: boolean) {
    if (readOnly) return;
    setMatrix((prev) => ({ ...prev, [featureKey]: checked ? new Set(PERMISSION_ACTIONS) : new Set() }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setErrors({});
    setServerError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = {
        name,
        description: description.trim().length > 0 ? description : undefined,
        permissions: matrixToPayload(matrix),
      };
      const url = mode === "create" ? "/api/admin/roles" : `/api/admin/roles/${role!.id}`;
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
        setServerError(data.error ?? "Could not save this role.");
        return;
      }
      if (mode === "create") {
        router.push(`/admin/roles/${data.role.id}`);
      } else {
        setNotice("Role updated.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!role) return;
    setServerError("");
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not delete this role.");
        return;
      }
      router.push("/admin/roles");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {isSuperAdmin && (
        <Alert variant="info">
          SUPER_ADMIN always holds every permission and cannot be edited or deleted — this is a read-only view.
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="role-name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Role name
              </label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                disabled={readOnly}
              />
              <FieldError id="role-name-error" message={errors.name} />
            </div>
            <div>
              <label htmlFor="role-description" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
                Description
              </label>
              <textarea
                id="role-description"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
                rows={2}
                className="w-full rounded-md border border-strong bg-surface px-3 py-2.5 text-sm text-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:bg-surface-subtle disabled:text-muted"
              />
            </div>
            {role && (
              <p className="text-xs text-muted">
                Key: <span className="font-mono">{role.key}</span> (derived from the name at creation time and
                fixed afterward)
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Permission matrix
          </h2>
          <p className="mb-4 text-xs text-muted">
            Feature x action grid, read from the central feature catalog (read-v2.md §10/§11).
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default text-sm">
              <thead className="bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Feature</th>
                  <th className="w-10 px-2 py-2 text-center">All</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} className="w-16 px-2 py-2 text-center">
                      {ACTION_LABELS[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {FEATURE_CATALOG.map((feature) => {
                  const granted = matrix[feature.key] ?? new Set<PermissionAction>();
                  const allChecked = granted.size === PERMISSION_ACTIONS.length;
                  return (
                    <tr key={feature.key}>
                      <td className="px-3 py-2 font-medium text-foreground">{feature.name}</td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`All permissions for ${feature.name}`}
                          checked={allChecked}
                          disabled={readOnly}
                          onChange={(e) => toggleRow(feature.key, e.target.checked)}
                        />
                      </td>
                      {PERMISSION_ACTIONS.map((action) => (
                        <td key={action} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${ACTION_LABELS[action]} - ${feature.name}`}
                            checked={granted.has(action)}
                            disabled={readOnly}
                            onChange={() => toggle(feature.key, action)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              {mode === "create" ? "Create role" : "Save changes"}
            </Button>
            {mode === "edit" && role && !role.isSystem && (
              <Button
                type="button"
                variant="secondary"
                className="text-destructive hover:bg-destructive-subtle"
                onClick={handleDelete}
                loading={deleteBusy}
              >
                Delete role
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
