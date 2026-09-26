"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Website } from "@/lib/websites/queries";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function WebsiteList({
  initialWebsites,
  activeWebsiteId,
}: {
  initialWebsites: Website[];
  activeWebsiteId: string | null;
}) {
  const router = useRouter();
  const [websites, setWebsites] = useState(initialWebsites);
  const [activeId, setActiveId] = useState(activeWebsiteId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSwitch(id: string) {
    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/websites/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        setError("Could not switch the active website.");
        return;
      }
      setActiveId(id);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setError("");
    setBusyId(id);
    try {
      const res = await fetch(`/api/websites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete this website.");
        return;
      }
      setWebsites((prev) => prev.filter((w) => w.id !== id));
      if (activeId === id) setActiveId(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}

      {websites.map((site) => {
        const isActive = site.id === activeId;
        const isBusy = busyId === site.id;
        return (
          <div
            key={site.id}
            className="flex flex-col gap-3 rounded-xl border border-default bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/websites/${site.id}`} className="truncate font-semibold text-foreground hover:underline">
                  {site.name}
                </Link>
                {isActive && <Badge variant="accent">Active</Badge>}
              </div>
              <p className="truncate text-sm text-muted">{site.domain}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {!isActive && (
                <Button variant="secondary" onClick={() => handleSwitch(site.id)} loading={isBusy}>
                  Switch
                </Button>
              )}
              <Link href={`/websites/${site.id}`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => handleDelete(site.id, site.name)}
                loading={isBusy}
                className="text-destructive hover:bg-destructive-subtle"
              >
                Delete
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
