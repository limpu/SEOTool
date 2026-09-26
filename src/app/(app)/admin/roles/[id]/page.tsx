import { notFound } from "next/navigation";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { getRoleWithPermissions } from "@/lib/rbac/role-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { RoleForm } from "@/components/admin/role-form";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("roles", "view");
  await ensureRbacSeed();

  const { id } = await params;
  const result = await getRoleWithPermissions(id);
  if (!result) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{result.role.name}</h1>
      <p className="mt-1 text-sm text-muted">{result.role.description ?? "No description."}</p>
      <div className="mt-6">
        <RoleForm mode="edit" role={result.role} initialGrants={result.permissionMatrix} />
      </div>
    </div>
  );
}
