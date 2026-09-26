import { notFound } from "next/navigation";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { getPackageWithFeatures } from "@/lib/rbac/package-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { ensureLimitCatalogSeed, listLimitDefinitions, listPackageLimits } from "@/lib/rbac/limit-admin";
import { PackageForm } from "@/components/admin/package-form";
import { PackageLimitsPanel } from "@/components/admin/package-limits-panel";

export default async function PackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("packages", "view");
  await ensureRbacSeed();
  await ensureLimitCatalogSeed();

  const { id } = await params;
  const result = await getPackageWithFeatures(id);
  if (!result) {
    notFound();
  }

  const [allDefinitions, packageLimits] = await Promise.all([
    listLimitDefinitions(),
    listPackageLimits(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">{result.pkg.name}</h1>
      <p className="mt-1 text-sm text-muted">{result.pkg.description ?? "No description."}</p>
      <div className="mt-6 space-y-6">
        <PackageForm mode="edit" pkg={result.pkg} initialFeatureStates={result.featureStates} />
        <PackageLimitsPanel packageId={id} allDefinitions={allDefinitions} initialLimits={packageLimits} />
      </div>
    </div>
  );
}
