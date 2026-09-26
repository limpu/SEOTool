import Link from "next/link";
import { Globe } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listUserWebsites } from "@/lib/websites/queries";
import { isSuperAdmin } from "@/lib/rbac/queries";
import { checkQuota } from "@/lib/rbac/quota";
import { getDashboardWebsiteSummaries } from "@/lib/dashboard/summary";
import { listOtherActivePackages } from "@/lib/rbac/upgrade-requests";
import { db } from "@/lib/db";
import { packages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DashboardSummaryTable } from "@/components/dashboard/summary-table";
import { UpgradePackageModal } from "@/components/dashboard/upgrade-package-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardGreeting } from "@/components/dashboard/greeting";

export default async function DashboardPage() {
  const user = await requireCurrentUser();

  const [sites, superAdmin, quota, currentPackageRow] = await Promise.all([
    listUserWebsites(user.id),
    isSuperAdmin(user.id),
    checkQuota(user.id, "max_websites"),
    db
      .select({ id: packages.id, name: packages.name })
      .from(users)
      .leftJoin(packages, eq(users.subscriptionPackageId, packages.id))
      .where(eq(users.id, user.id))
      .limit(1),
  ]);

  const currentPackage = currentPackageRow[0]?.id ? { id: currentPackageRow[0].id, name: currentPackageRow[0].name! } : null;
  const otherPackages = await listOtherActivePackages(currentPackage?.id ?? null);

  const summaries = await getDashboardWebsiteSummaries(user.id);

  const websiteLimitLabel = quota.unlimited || quota.limit === null ? "Unlimited" : String(quota.limit);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Link href="/websites/new">
          <Button>+ Add Website</Button>
        </Link>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-5">
          <DashboardGreeting name={user.name} />

          <div className="mt-4 flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Websites</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {sites.length} of {websiteLimitLabel}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Package</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-xl font-bold text-foreground">{currentPackage?.name ?? "No package"}</span>
                <UpgradePackageModal
                  currentPackageName={currentPackage?.name ?? "No package"}
                  options={otherPackages}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DashboardSummaryTable rows={summaries} />

      {sites.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-5">
            <EmptyState
              icon={Globe}
              title="No websites yet"
              description="Add your first website to start measuring its SEO health, AI visibility and search performance."
              actionLabel="Add a website"
              actionHref="/websites/new"
            />
          </CardContent>
        </Card>
      )}

      {superAdmin && (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Admin</p>
            <Link
              href="/admin"
              className="mt-2 inline-block rounded-sm text-sm font-medium text-accent underline hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Go to admin
            </Link>
          </CardContent>
        </Card>
      )}

      <Link
        href="/settings/profile"
        className="mt-6 inline-block rounded-sm text-sm font-medium text-accent underline hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Go to profile settings
      </Link>
    </div>
  );
}
