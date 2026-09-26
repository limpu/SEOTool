"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups, primaryNavItem, adminNavGroup } from "./nav-data";
import { WORKSPACE_NAV } from "@/lib/website-workspace/nav";

export function SidebarNav({
  onNavigate,
  isAdmin = false,
  activeWebsiteId = null,
}: {
  onNavigate?: () => void;
  isAdmin?: boolean;
  activeWebsiteId?: string | null;
}) {
  const pathname = usePathname();

  // Website-scoped groups (SEO / AI Search / Research / Performance /
  // Reports) route into the active website's workspace
  // (/websites/[id]/<slug>). The exact RBAC/entitlement filtering for each
  // item happens inside the workspace layout (WorkspaceSidebar) against the
  // real signed-in user — this top-level shortcut list only decides
  // implemented vs. "Soon" so there's no second permission list to drift.
  // Inside a website workspace route, WorkspaceSidebar (rendered by
  // /websites/[id]/layout.tsx) already shows this same module list, scoped
  // and RBAC-filtered for whichever website is actually being viewed (which
  // may differ from the cookie's "active" website if the user navigated
  // directly). Suppress the duplicate here so there's exactly one nav for
  // website modules, not two disagreeing lists stacked in the same column.
  const insideWorkspace = pathname.startsWith("/websites/") && pathname !== "/websites/new";
  const websiteGroups = activeWebsiteId && !insideWorkspace
    ? WORKSPACE_NAV.filter((g) => g.title !== "Overview").map((g) => ({
        title: g.title,
        items: g.items.map((item) => ({
          label: item.label,
          href: item.implemented ? `/websites/${activeWebsiteId}/${item.slug}` : undefined,
          comingSoon: !item.implemented,
        })),
      }))
    : navGroups;

  const groups = isAdmin ? [adminNavGroup, ...websiteGroups] : websiteGroups;

  return (
    <nav className="flex flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Primary">
      <Link
        href={primaryNavItem.href!}
        onClick={onNavigate}
        aria-current={pathname === primaryNavItem.href ? "page" : undefined}
        className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
          pathname === primaryNavItem.href
            ? "bg-primary text-primary-foreground"
            : "text-secondary-foreground hover:bg-surface-hover"
        }`}
      >
        {primaryNavItem.label}
      </Link>

      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
            {group.title}
          </h3>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                {item.comingSoon || !item.href ? (
                  <span
                    className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted"
                    title="Coming in a future phase"
                  >
                    {item.label}
                    <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Soon
                    </span>
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                      pathname === item.href
                        ? "bg-primary text-primary-foreground"
                        : "text-secondary-foreground hover:bg-surface-hover"
                    }`}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
