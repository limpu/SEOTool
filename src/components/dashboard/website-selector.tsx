"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import type { Website } from "@/lib/websites/queries";
import { getWorkspaceItem } from "@/lib/website-workspace/nav";

export function WebsiteSelector({
  websites,
  activeWebsite,
}: {
  websites: Website[];
  activeWebsite: Website | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSwitch(id: string) {
    if (id === activeWebsite?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await fetch(`/api/websites/${id}/activate`, { method: "POST" });

      // If currently viewing a specific report (e.g. /websites/A/technical),
      // switching the active website should land on the SAME report for the
      // new website (/websites/B/technical), not the dashboard or a
      // mismatched page — the current sub-route slug is preserved when it's
      // a known workspace route, otherwise falls back to that website's
      // Overview.
      const match = pathname.match(/^\/websites\/[^/]+\/([^/]+)/);
      const slug = match?.[1];
      const item = slug ? getWorkspaceItem(slug) : undefined;
      if (item) {
        router.push(`/websites/${id}/${item.slug}`);
      } else {
        router.refresh();
      }
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  if (websites.length === 0) {
    return (
      <Link
        href="/websites/new"
        className="ml-2 hidden items-center gap-2 rounded-md border border-default px-3 py-1.5 text-sm text-secondary-foreground hover:bg-surface-hover sm:flex"
      >
        + Add your first website
      </Link>
    );
  }

  return (
    <div className="relative ml-2 hidden sm:block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-56 items-center gap-2 rounded-md border border-default px-3 py-1.5 text-sm text-secondary-foreground hover:bg-surface-hover disabled:opacity-50"
      >
        <span className="truncate">{activeWebsite?.name ?? "Select website"}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 z-20 mt-2 w-64 rounded-md border border-default bg-surface py-1 shadow-lg"
        >
          <ul className="max-h-64 overflow-y-auto">
            {websites.map((site) => (
              <li key={site.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleSwitch(site.id)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-surface-hover ${
                    site.id === activeWebsite?.id ? "font-medium text-foreground" : "text-secondary-foreground"
                  }`}
                >
                  <span className="truncate">{site.name}</span>
                  {site.id === activeWebsite?.id && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-default">
            <Link
              href="/websites"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-secondary-foreground hover:bg-surface-hover"
            >
              Manage websites
            </Link>
            <Link
              href="/websites/new"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-secondary-foreground hover:bg-surface-hover"
            >
              + Add website
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
