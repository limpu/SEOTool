"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field-error";
import { Alert } from "@/components/ui/alert";
import type { AdminUserSummary } from "@/lib/admin/user-queries";
import type { UserRoleSummary } from "@/lib/rbac/queries";
import type { PackageSummary } from "@/lib/rbac/package-admin";

export function UserDetailPanel({
  user,
  roles,
  packages,
}: {
  user: AdminUserSummary;
  roles: UserRoleSummary[];
  packages: PackageSummary[];
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(user.roles.map((r) => r.id)));
  const [packageId, setPackageId] = useState(user.subscriptionPackageId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setServerError("");
    setNotice("");
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    await withBusy("profile", async () => {
      setErrors({});
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
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
        setServerError(data.error ?? "Could not save profile changes.");
        return;
      }
      setNotice("Profile updated.");
      router.refresh();
    });
  }

  async function handleToggleStatus() {
    const nextStatus = user.status === "active" ? "suspended" : "active";
    await withBusy("status", async () => {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not change status.");
        return;
      }
      setNotice(nextStatus === "active" ? "User activated." : "User deactivated.");
      router.refresh();
    });
  }

  function toggleRole(id: string, checked: boolean) {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAssignRoles() {
    await withBusy("role", async () => {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: Array.from(roleIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not update roles.");
        return;
      }
      setNotice("Roles updated.");
      router.refresh();
    });
  }

  async function handleAssignSubscription() {
    await withBusy("subscription", async () => {
      const res = await fetch(`/api/admin/users/${user.id}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: packageId.length > 0 ? packageId : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Could not assign subscription package.");
        return;
      }
      setNotice("Subscription package updated.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Profile</h2>
        <form onSubmit={handleSaveProfile} noValidate className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
              Name
            </label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            <FieldError id="name-error" message={errors.name} />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
              Email
            </label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            <FieldError id="email-error" message={errors.email} />
          </div>
          <Button type="submit" loading={busy === "profile"}>
            Save profile
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Status</h2>
        <p className="mb-3 text-sm text-secondary-foreground">
          Current status: <span className="font-medium">{user.status}</span>
          {user.status !== "deleted" && (
            <>
              {" · "}Email {user.emailVerified ? "verified" : "not verified"}
            </>
          )}
        </p>
        {user.status !== "deleted" && (
          <Button
            variant="secondary"
            onClick={handleToggleStatus}
            loading={busy === "status"}
            className={user.status === "active" ? "text-destructive hover:bg-destructive-subtle" : ""}
          >
            {user.status === "active" ? "Deactivate user" : "Activate user"}
          </Button>
        )}
      </section>

      <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Roles</h2>
        <p className="mb-3 text-xs text-muted">
          A user can hold more than one role — the effective permission set is the union of all selected roles.
        </p>
        <div className="mb-4 space-y-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-secondary-foreground">
              <input
                type="checkbox"
                checked={roleIds.has(r.id)}
                onChange={(e) => toggleRole(r.id, e.target.checked)}
              />
              {r.name}
              {r.isSystem && <span className="text-xs text-muted">(system)</span>}
            </label>
          ))}
        </div>
        <Button variant="secondary" onClick={handleAssignRoles} loading={busy === "role"}>
          Save roles
        </Button>
      </section>

      <section className="rounded-xl border border-default bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Subscription package
        </h2>
        <p className="mb-3 text-xs text-muted">
          Assigns the user&apos;s real package via the `packages` table (Phase 16). This is entitlement
          only — usage limits and quota enforcement are Phase 17&apos;s job.
        </p>
        <div className="flex items-end gap-3">
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="w-full rounded-md border border-strong px-3 py-2.5 text-sm"
          >
            <option value="">No package</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.status === "inactive" ? "(inactive)" : ""}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleAssignSubscription} loading={busy === "subscription"}>
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}
