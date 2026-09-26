"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Unplug } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Stage 3B — the WRITE actions carried over from the retired `GscPanel`.
 *
 * All four of that panel's mutations survive, against the SAME API routes:
 *   • Connect      → a full-page navigation to `/api/websites/[id]/gsc/connect`
 *                    (an OAuth redirect must be a navigation, never a fetch).
 *   • Choose property → `POST /api/websites/[id]/gsc/properties`
 *   • Sync now     → `POST /api/websites/[id]/gsc/sync`
 *   • Disconnect   → `DELETE /api/websites/[id]/gsc`
 *
 * What is deliberately NOT carried over is the panel's status FETCH: the
 * Server Component already knows the connection state and the synced rows, so
 * these leaves only mutate and then `router.refresh()`. Nothing here holds a
 * second copy of the numbers.
 *
 * SYNC STAYS EXPLICIT. Phase 26 made syncing a manual action to respect
 * Google's Search Analytics quota, and that is preserved exactly: nothing on
 * this page calls Google on load. The Server Component reads only the rows a
 * previous sync already persisted.
 */

/** One-time banner for the `?gsc=connected|denied|…` flags the OAuth callback redirects back with. */
export function GscOAuthBanner() {
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const flag = searchParams.get("gsc");
    if (!flag) return;
    const message = searchParams.get("gscMessage");
    if (flag === "connected") {
      setBanner({ variant: "success", text: "Google account connected. Choose a Search Console property below." });
    } else if (flag === "denied") {
      setBanner({ variant: "error", text: "Google consent was declined — no changes were made." });
    } else {
      setBanner({ variant: "error", text: message ?? "Something went wrong connecting Google Search Console." });
    }
    // Clean the URL so a refresh does not replay a stale banner.
    const url = new URL(window.location.href);
    url.searchParams.delete("gsc");
    url.searchParams.delete("gscMessage");
    window.history.replaceState({}, "", url.toString());
  }, [searchParams]);

  if (!banner) return null;
  return <Alert variant={banner.variant}>{banner.text}</Alert>;
}

export function ConnectSearchConsoleButton({ websiteId }: { websiteId: string }) {
  return (
    <a href={`/api/websites/${websiteId}/gsc/connect`} className="inline-block">
      <Button type="button" variant="primary">
        Connect Search Console
      </Button>
    </a>
  );
}

interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
}

/**
 * The property picker. This one DOES fetch on mount — but only the list of
 * properties the connected Google account owns, and only in the state where
 * no property has been chosen yet, which is exactly when the user needs it.
 * It never fetches report data.
 */
export function GscPropertyPicker({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [properties, setProperties] = useState<GscProperty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/gsc/properties`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load Search Console properties.");
      setProperties(body.sites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Search Console properties.");
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function select(propertyUrl: string) {
    setSelecting(propertyUrl);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/gsc/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to select property.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select property.");
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p className="text-sm text-muted">Loading properties from Google…</p>}
      {properties && properties.length === 0 && !loading && (
        <p className="text-sm text-muted">
          No verified properties were found for this Google account. Verify a site in Search Console first.
        </p>
      )}
      {properties && properties.length > 0 && (
        <ul className="divide-y divide-default rounded-lg border border-default">
          {properties.map((property) => (
            <li key={property.siteUrl} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="break-all text-secondary-foreground">{property.siteUrl}</span>
                <span className="ml-2 text-xs text-muted">{property.permissionLevel}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={selecting === property.siteUrl}
                onClick={() => select(property.siteUrl)}
              >
                Select
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GscConnectionActions({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  async function sync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/gsc/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Sync failed.");
      setResult({ variant: "success", text: `Synced ${body.queryRows} queries and ${body.pageRows} pages.` });
      router.refresh();
    } catch (err) {
      // A Google failure is reported AS a failure. It never silently leaves the
      // previously-synced numbers on screen looking freshly measured.
      setResult({ variant: "error", text: err instanceof Error ? err.message : "Sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Search Console for this website? Synced data will be removed.")) return;
    try {
      const res = await fetch(`/api/websites/${websiteId}/gsc`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect.");
      router.refresh();
    } catch (err) {
      setResult({ variant: "error", text: err instanceof Error ? err.message : "Failed to disconnect." });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={sync} loading={syncing}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button type="button" variant="ghost" onClick={disconnect}>
          <Unplug className="h-4 w-4" aria-hidden="true" />
          Disconnect
        </Button>
      </div>
      {result && <Alert variant={result.variant}>{result.text}</Alert>}
    </div>
  );
}
