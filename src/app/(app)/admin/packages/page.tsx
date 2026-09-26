import Link from "next/link";
import { requireAdminAccess } from "@/lib/rbac/require-admin";
import { listPackagesWithCounts } from "@/lib/rbac/package-admin";
import { ensureRbacSeed } from "@/lib/rbac/seed";
import { Button } from "@/components/ui/button";
import { PackageTable } from "@/components/admin/package-table";

export default async function AdminPackagesPage() {
  await requireAdminAccess("packages", "view");
  await ensureRbacSeed();

  const packageList = await listPackagesWithCounts();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscription Packages</h1>
          <p className="mt-1 text-sm text-muted">
            {packageList.length} package{packageList.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/admin/packages/new">
          <Button>+ Create package</Button>
        </Link>
      </div>

      <PackageTable packages={packageList} />
    </div>
  );
}
