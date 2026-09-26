import { ReactNode } from "react";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getActiveWebsite, listUserWebsites } from "@/lib/websites/queries";
import { AppShell } from "@/components/dashboard/app-shell";
import { isSuperAdmin } from "@/lib/rbac/queries";
import { ensureRbacSeed } from "@/lib/rbac/seed";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireCurrentUser();
  await ensureRbacSeed();
  const [sites, activeSite, isAdmin] = await Promise.all([
    listUserWebsites(user.id),
    getActiveWebsite(user.id),
    isSuperAdmin(user.id),
  ]);

  return (
    <AppShell user={user} websites={sites} activeWebsite={activeSite} isAdmin={isAdmin}>
      {children}
    </AppShell>
  );
}
