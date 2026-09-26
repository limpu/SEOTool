import Link from "next/link";
import { Globe } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listUserWebsites, getActiveWebsite } from "@/lib/websites/queries";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { WebsiteList } from "@/components/website/website-list";

export default async function WebsitesPage() {
  const user = await requireCurrentUser();
  const [sites, activeSite] = await Promise.all([
    listUserWebsites(user.id),
    getActiveWebsite(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Websites</h1>
        <Link href="/websites/new">
          <Button>+ Add website</Button>
        </Link>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-strong bg-surface py-6">
          <EmptyState
            icon={Globe}
            title="You haven't added any websites yet"
            description="Add a website to start auditing it."
          >
            <Link href="/websites/new">
              <Button>+ Add your first website</Button>
            </Link>
          </EmptyState>
        </div>
      ) : (
        <WebsiteList initialWebsites={sites} activeWebsiteId={activeSite?.id ?? null} />
      )}
    </div>
  );
}
