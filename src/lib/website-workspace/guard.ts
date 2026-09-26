import { notFound } from "next/navigation";
import { requireCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser, type Website } from "@/lib/websites/queries";
import { getWorkspaceItem, type WorkspaceNavItem } from "./nav";
import { getWorkspaceItemAccess, type WorkspaceItemAccess } from "./access";

/**
 * Per-page guard for every /websites/[id]/<slug> report route. Re-derives
 * ownership (same pattern as the old giant page — `requireCurrentUser` +
 * `getWebsiteForUser`, 404 on mismatch/not-found) independently of the
 * layout, and resolves RBAC + entitlement for the page's own feature key.
 * A user who is not `authorized` gets a 404 (route directly hit, not just
 * hidden from the sidebar) rather than the report — this is the
 * "attempting the route directly should also be denied" requirement.
 */
export async function requireWorkspacePage(
  websiteIdParam: string,
  slug: string
): Promise<{ user: CurrentUser; site: Website; item: WorkspaceNavItem; access: WorkspaceItemAccess }> {
  const user = await requireCurrentUser();
  const site = await getWebsiteForUser(user.id, websiteIdParam);
  if (!site) notFound();

  const item = getWorkspaceItem(slug);
  if (!item || !item.implemented) notFound();

  const access = await getWorkspaceItemAccess(user.id, item);
  if (!access.authorized) notFound();

  return { user, site, item, access };
}
