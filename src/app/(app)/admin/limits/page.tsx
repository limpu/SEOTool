import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { ensureLimitCatalogSeed, listLimitDefinitions } from "@/lib/rbac/limit-admin";
import { LimitDefinitionTable } from "@/components/admin/limit-definition-table";

export default async function AdminLimitsPage() {
  await requireAdminAccess("packages", "view");
  await ensureLimitCatalogSeed();

  const definitions = await listLimitDefinitions();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Limitations</h1>
        <p className="mt-1 text-sm text-muted">
          The reference catalog of resources that can be capped per package (Maximum Websites, Maximum
          Audits Per Month, etc.). Assign a numeric value and period to a specific package from that
          package&apos;s edit screen.
        </p>
      </div>
      <LimitDefinitionTable initialDefinitions={definitions} />
    </div>
  );
}
