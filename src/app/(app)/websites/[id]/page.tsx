import { redirect, notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";

// /websites/[id] now redirects into the workspace's default landing page.
// Ownership is verified here too (not just trusted from the layout) before
// redirecting, so a non-owner hitting this bare route gets a 404, not a
// redirect leaking the existence of someone else's site id.
export default async function WebsiteRootPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const site = await getWebsiteForUser(user.id, id);
  if (!site) notFound();
  redirect(`/websites/${id}/overview`);
}
