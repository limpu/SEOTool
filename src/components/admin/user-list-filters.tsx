"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { UserRoleSummary } from "@/lib/rbac/queries";

export function UserListFilters({
  roles,
  initialSearch,
  initialStatus,
  initialRoleId,
}: {
  roles: UserRoleSummary[];
  initialSearch: string;
  initialStatus?: string;
  initialRoleId?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus ?? "");
  const [roleId, setRoleId] = useState(initialRoleId ?? "");

  function apply(e?: FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (roleId) params.set("roleId", roleId);
    router.push(`/admin/users?${params.toString()}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-end gap-3 rounded-xl border border-default bg-surface p-4">
      <div className="min-w-48 flex-1">
        <label htmlFor="search" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Search
        </label>
        <Input
          id="search"
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-strong px-3 py-2.5 text-sm"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div>
        <label htmlFor="roleId" className="mb-1.5 block text-sm font-medium text-secondary-foreground">
          Role
        </label>
        <select
          id="roleId"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="rounded-md border border-strong px-3 py-2.5 text-sm"
        >
          <option value="">All</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" variant="secondary">
        Apply filters
      </Button>
    </form>
  );
}
