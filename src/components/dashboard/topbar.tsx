"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { Website } from "@/lib/websites/queries";
import { Badge } from "@/components/ui/badge";
import { WebsiteSelector } from "./website-selector";
import { Logo } from "@/components/ui/logo";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Topbar({
  user,
  websites,
  activeWebsite,
  onMenuClick,
}: {
  user: CurrentUser;
  websites: Website[];
  activeWebsite: Website | null;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-default bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted hover:bg-surface-hover lg:hidden"
        aria-label="Toggle navigation"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <Logo href="/dashboard" size={30} className="mr-2" />

      <WebsiteSelector websites={websites} activeWebsite={activeWebsite} />

      <div className="ml-auto flex items-center gap-2">
        <input
          type="search"
          disabled
          placeholder="Search (coming soon)"
          title="Global search arrives in a later phase"
          className="hidden w-56 rounded-md border border-default bg-surface-subtle px-3 py-1.5 text-sm text-muted placeholder:text-muted disabled:cursor-not-allowed md:block"
        />

        <button
          type="button"
          disabled
          title="Notifications arrive in a later phase"
          className="rounded-md p-2 text-muted disabled:cursor-not-allowed"
          aria-label="Notifications"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
            />
          </svg>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {initials(user.name) || "?"}
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-default bg-surface py-1 shadow-lg"
            >
              <div className="border-b border-default px-4 py-3">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
                {!user.emailVerified && (
                  <p className="mt-1.5">
                    <Badge variant="warning">Email not verified</Badge>
                  </p>
                )}
              </div>
              <Link
                href="/settings/profile"
                role="menuitem"
                onClick={() => setProfileOpen(false)}
                className="block px-4 py-2 text-sm text-secondary-foreground hover:bg-surface-hover"
              >
                Profile settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className="block w-full px-4 py-2 text-left text-sm text-secondary-foreground hover:bg-surface-hover disabled:opacity-50"
              >
                {loggingOut ? "Signing out..." : "Log out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
