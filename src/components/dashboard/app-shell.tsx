"use client";

import { ReactNode, useState } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { Website } from "@/lib/websites/queries";
import { Topbar } from "./topbar";
import { SidebarNav } from "./sidebar-nav";
import { Breadcrumbs } from "./breadcrumbs";
import { Footer } from "@/components/ui/footer";

export function AppShell({
  user,
  websites,
  activeWebsite,
  isAdmin = false,
  children,
}: {
  user: CurrentUser;
  websites: Website[];
  activeWebsite: Website | null;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Topbar
        user={user}
        websites={websites}
        activeWebsite={activeWebsite}
        onMenuClick={() => setMobileNavOpen((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r border-default bg-surface lg:block">
          <SidebarNav isAdmin={isAdmin} activeWebsiteId={activeWebsite?.id ?? null} />
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-30 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="absolute inset-0 bg-primary/40"
            />
            <aside className="relative h-full w-64 border-r border-default bg-surface shadow-xl">
              <SidebarNav
                isAdmin={isAdmin}
                activeWebsiteId={activeWebsite?.id ?? null}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </aside>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-y-auto">
          <Breadcrumbs />
          <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
