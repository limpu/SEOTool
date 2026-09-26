import Link from "next/link";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { listRolesWithCounts } from "@/lib/rbac/role-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { Button } from "@/components/ui/button";
import { RoleTable } from "@/components/admin/role-table";

export default async function AdminRolesPage() {
  await requireAdminAccess("roles", "view");
  await ensureRbacSeed();

  const roleList = await listRolesWithCounts();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles</h1>
          <p className="mt-1 text-sm text-muted">
            {roleList.length} role{roleList.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/admin/roles/new">
          <Button>+ Create role</Button>
        </Link>
      </div>

      <RoleTable roles={roleList} />
    </div>
  );
}
