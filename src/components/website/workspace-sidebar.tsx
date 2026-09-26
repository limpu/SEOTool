"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/website-workspace/nav";
import type { WorkspaceItemAccess } from "@/lib/website-workspace/access";

type GroupWithAccess = {
  title: string;
  items: { item: WorkspaceNavItem; access: WorkspaceItemAccess }[];
};

export function WorkspaceSidebar({
  websiteId,
  websiteName,
  groups,
}: {
  websiteId: string;
  websiteName: string;
  groups: GroupWithAccess[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navBody = (
    <>
      <div className="mb-2 truncate px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
        {websiteName}
      </div>
      <nav className="flex flex-col gap-4" aria-label="Website workspace">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {group.title}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map(({ item, access }) => {
                const href = `/websites/${websiteId}/${item.slug}`;
                const isActive = pathname === href;

                if (!item.implemented) {
                  return (
                    <li key={item.slug}>
                      <span
                        title="Coming soon"
                        className="flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted"
                      >
                        {item.label}
                        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                          Soon
                        </span>
                      </span>
                    </li>
                  );
                }

                if (!access.authorized) {
                  // Not permitted for this role at all — do not render as an accessible item.
                  return null;
                }

                return (
                  <li key={item.slug}>
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-surface-hover"
                      }`}
                    >
                      {item.label}
                      {!access.entitled && (
                        <span className="rounded-full bg-status-warning-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                          Upgrade
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile: collapsed behind a toggle, same pattern as the outer AppShell/SidebarNav drawer */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="mb-2 flex w-full items-center justify-between rounded-lg border border-default bg-surface px-3 py-2 text-sm font-medium text-secondary-foreground shadow-sm"
          aria-expanded={mobileOpen}
        >
          <span className="truncate">{websiteName} workspace menu</span>
          <span aria-hidden="true">☰</span>
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              aria-label="Close workspace navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-primary/40"
            />
            <aside className="relative h-full w-72 max-w-[85vw] overflow-y-auto border-r border-default bg-surface p-3 shadow-xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close"
                className="mb-2 ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover"
              >
                ✕
              </button>
              {navBody}
            </aside>
          </div>
        )}
      </div>

      {/* Desktop/tablet: inline sidebar, same as before */}
      <aside className="hidden w-full shrink-0 rounded-xl border border-default bg-surface p-3 lg:block lg:w-60">
        {navBody}
      </aside>
    </>
  );
}
