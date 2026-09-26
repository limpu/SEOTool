import Link from "next/link";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { listUsers } from "@/lib/admin/user-queries";
import { listAllRoles } from "@/lib/rbac/queries";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { Button } from "@/components/ui/button";
import { UserListFilters } from "@/components/admin/user-list-filters";
import { UserTable } from "@/components/admin/user-table";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminAccess("users", "view");
  await ensureRbacSeed();

  const params = await searchParams;
  const search = params.search ?? "";
  const status = (params.status as "active" | "suspended" | "deleted" | undefined) ?? undefined;
  const roleId = params.roleId ?? undefined;
  const page = Number(params.page ?? "1") || 1;

  const [{ users, total }, roles] = await Promise.all([
    listUsers({ search, status, roleId, page, pageSize: 25 }),
    listAllRoles(),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted">
            {total} account{total === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button>+ Create user</Button>
        </Link>
      </div>

      <UserListFilters roles={roles} initialSearch={search} initialStatus={status} initialRoleId={roleId} />

      <div className="mt-4">
        <UserTable users={users} />
      </div>

      <div className="mt-6 flex justify-center gap-2 text-sm">
        {page > 1 && (
          <Link
            href={`/admin/users?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
            className="rounded-md border border-strong px-3 py-1.5 text-secondary-foreground hover:bg-surface-hover"
          >
            Previous
          </Link>
        )}
        {total > page * 25 && (
          <Link
            href={`/admin/users?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
            className="rounded-md border border-strong px-3 py-1.5 text-secondary-foreground hover:bg-surface-hover"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
