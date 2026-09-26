import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { PackageForm } from "@/components/admin/package-form";

export default async function NewPackagePage() {
  await requireAdminAccess("packages", "create");
  await ensureRbacSeed();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">Create package</h1>
      <p className="mt-1 text-sm text-muted">
        Define the plan and toggle which features it includes.
      </p>
      <div className="mt-6">
        <PackageForm mode="create" initialFeatureStates={[]} />
      </div>
    </div>
  );
}
