import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { RoleForm } from "@/components/admin/role-form";

export default async function NewRolePage() {
  await requireAdminAccess("roles", "create");
  await ensureRbacSeed();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">Create role</h1>
      <p className="mt-1 text-sm text-muted">
        Pick a name and toggle the features/actions this role should grant.
      </p>
      <div className="mt-6">
        <RoleForm mode="create" initialGrants={[]} />
      </div>
    </div>
  );
}
