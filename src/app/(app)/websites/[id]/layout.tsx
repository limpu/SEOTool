import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { WORKSPACE_NAV } from "@/lib/website-workspace/nav";
import { getWorkspaceItemAccess } from "@/lib/website-workspace/access";
import { WorkspaceSidebar } from "@/components/website/workspace-sidebar";

/**
 * Website Workspace shell (Phase 35, read.md) — wraps every
 * /websites/[id]/<report> route. Reuses the EXACT ownership-check pattern
 * already used by the old giant page (`requireCurrentUser` +
 * `getWebsiteForUser`, 404 on mismatch) so restructuring routing does not
 * weaken security. Each child page re-verifies ownership itself too
 * (defense in depth — a layout alone would still leave the page's own data
 * fetch unguarded if copy-pasted elsewhere later).
 */
export default async function WebsiteWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const site = await getWebsiteForUser(user.id, id);
  if (!site) notFound();

  const groups = await Promise.all(
    WORKSPACE_NAV.map(async (group) => ({
      title: group.title,
      items: await Promise.all(
        group.items.map(async (item) => ({
          item,
          access: await getWorkspaceItemAccess(user.id, item),
        }))
      ),
    }))
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <WorkspaceSidebar websiteId={site.id} websiteName={site.name} groups={groups} />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}
