import { notFound } from "next/navigation";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { getUserById } from "@/lib/admin/user-queries";
import { listAllRoles } from "@/lib/rbac/queries";
import { listPackagesWithCounts } from "@/lib/rbac/package-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminAccess("users", "view");
  await ensureRbacSeed();

  const { id } = await params;
  const [target, roles, allPackages] = await Promise.all([
    getUserById(id),
    listAllRoles(),
    listPackagesWithCounts(),
  ]);

  if (!target) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">{target.name}</h1>
      <p className="mt-1 text-sm text-muted">{target.email}</p>

      <div className="mt-6">
        <UserDetailPanel user={target} roles={roles} packages={allPackages} />
      </div>
    </div>
  );
}
