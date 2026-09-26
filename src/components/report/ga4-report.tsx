"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Download, Unplug } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from "@/components/charts/stat-tile";
import { formatCount, formatRatioAsPercent } from "@/components/charts/format";
import { decodeLandingPage } from "@/lib/utils/decode-url-path";

/**
 * Stage 3B — the GA4 report, carried over from the retired `Ga4Panel`.
 *
 * ═══ THE RULE THIS COMPONENT EXISTS TO PRESERVE ═══════════════════════════
 *
 * GA4 IS NEVER FETCHED ON PAGE LOAD. Nothing in this file calls Google until
 * the user clicks "Load report". That was a deliberate Phase 36 decision and
 * it is preserved verbatim, for three reasons that all still hold:
 *
 *   1. QUOTA. `/api/websites/[id]/ga4/report` issues FOUR live
 *      `runReport` calls to the Data API on every invocation, and is rate
 *      limited (`ga4_report`, 30/hour). Opening a page must not spend that.
 *   2. LATENCY. Four round trips to Google would sit in front of the whole
 *      page render if it were server-fetched.
 *   3. AN EXPIRED TOKEN MUST NOT BREAK THE PAGE. Google connections go stale
 *      (the sibling Search Console connection on this very dataset is sitting
 *      on a revoked refresh token). A page that fetched on load would render
 *      an error instead of a report — or, worse, 500. Here a Google failure
 *      is caught and shown as a message beside a button the user can retry,
 *      and everything else on the page still renders.
 *
 * This is why the module is a Server Component that fetches NOTHING from
 * Google, plus this leaf that fetches only on an explicit click. The whole
 * report is deliberately not pre-rendered — there is no `ga4_metrics` table,
 * so there is nothing persisted to render.
 *
 * Every failure path from the API (`Ga4NotConnectedError`,
 * `Ga4NoPropertySelectedError`, `Ga4ApiError`, a 429) already arrives as a
 * JSON error rather than a thrown exception, and is rendered here as an
 * honest message — never as a zeroed report.
 */

interface Ga4ReportData {
  dateRangeStart: string;
  dateRangeEnd: string;
  traffic: {
    totalUsers: number;
    newUsers: number;
    sessions: number;
    engagedSessions: number;
    engagementRate: number;
  };
  pages: { landingPage: string; views: number; users: number; averageEngagementTimeSeconds: number }[];
  acquisition: { channel: string; sessions: number; users: number }[];
  conversion: { keyEvents: number; sessions: number; conversionRate: number; hasKeyEvents: boolean };
}

interface Ga4Property {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/** One-time banner for the `?ga4=connected|denied|…` flags the OAuth callback redirects back with. */
export function Ga4OAuthBanner() {
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const flag = searchParams.get("ga4");
    if (!flag) return;
    const message = searchParams.get("ga4Message");
    if (flag === "connected") {
      setBanner({ variant: "success", text: "Google account connected. Choose a GA4 property below." });
    } else if (flag === "denied") {
      setBanner({ variant: "error", text: "Google consent was declined — no changes were made." });
    } else {
      setBanner({ variant: "error", text: message ?? "Something went wrong connecting Google Analytics." });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("ga4");
    url.searchParams.delete("ga4Message");
    window.history.replaceState({}, "", url.toString());
  }, [searchParams]);

  if (!banner) return null;
  return <Alert variant={banner.variant}>{banner.text}</Alert>;
}

export function ConnectGa4Button({ websiteId }: { websiteId: string }) {
  return (
    <a href={`/api/websites/${websiteId}/ga4/connect`} className="inline-block">
      <Button type="button" variant="primary">
        Connect Google Analytics
      </Button>
    </a>
  );
}

/**
 * Property picker. Fetches the ADMIN API's property list on mount — but only
 * in the state where no property is chosen, and it is not report data: no
 * `runReport` call is made and no `ga4_report` quota is consumed.
 */
export function Ga4PropertyPicker({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [properties, setProperties] = useState<Ga4Property[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/ga4/properties`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load Google Analytics properties.");
      setProperties(body.properties ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Google Analytics properties.");
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function select(property: Ga4Property) {
    setSelecting(property.propertyId);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/ga4/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.propertyId, propertyName: property.displayName }),
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
          No Analytics properties were found for this Google account. Create a GA4 property first.
        </p>
      )}
      {properties && properties.length > 0 && (
        <ul className="divide-y divide-default rounded-lg border border-default">
          {properties.map((property) => (
            <li
              key={property.propertyId}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="text-secondary-foreground">{property.displayName}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {property.accountDisplayName} · {property.propertyId}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={selecting === property.propertyId}
                onClick={() => select(property)}
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

export function Ga4DisconnectButton({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (!window.confirm("Disconnect Google Analytics for this website?")) return;
    try {
      const res = await fetch(`/api/websites/${websiteId}/ga4`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" onClick={disconnect}>
        <Unplug className="h-4 w-4" aria-hidden="true" />
        Disconnect
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/**
 * The explicit-fetch report. Renders a button and an honest "nothing loaded
 * yet" state until the user asks for data.
 */
export function Ga4LiveReport({ websiteId }: { websiteId: string }) {
  const [report, setReport] = useState<Ga4ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/ga4/report`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load report.");
      setReport(body);
    } catch (err) {
      // A Google failure is a failure, stated as one. The previous report (if
      // any) is left on screen with its own date range still labelled, so a
      // stale reading can never be mistaken for a fresh one.
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          action={
            <Button type="button" variant="primary" onClick={loadReport} loading={loading}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {loading ? "Loading…" : report ? "Reload report" : "Load report"}
            </Button>
          }
        >
          <CardTitle>Live report</CardTitle>
          <CardDescription>
            Google Analytics data is fetched only when you click — never automatically on page load. This platform
            stores no Analytics history, so every figure below is read live from Google at the moment you ask for it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="error">
              <p className="font-semibold">Google Analytics could not be read</p>
              <p className="mt-0.5 text-sm text-secondary-foreground">{error}</p>
              <p className="mt-1 text-xs text-muted">
                Nothing on this page has been substituted or estimated as a result — this is a failure to read, not a
                measurement of zero.
              </p>
            </Alert>
          )}

          {!report && !error && (
            <EmptyState
              icon={Download}
              title="No report loaded yet"
              description="Click “Load report” to pull the last 28 days of Traffic, Acquisition, Page performance and Conversion data from Google."
            />
          )}

          {report && (
            <p className="text-xs text-muted">
              Range: {report.dateRangeStart} to {report.dateRangeEnd} (last 28 days).{" "}
              <Badge variant="accent">Live from Google Analytics</Badge>
            </p>
          )}
        </CardContent>
      </Card>

      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Traffic</CardTitle>
              <CardDescription>Audience totals across the reported range.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile label="Users" value={formatCount(report.traffic.totalUsers)} />
                <StatTile label="New users" value={formatCount(report.traffic.newUsers)} />
                <StatTile label="Sessions" value={formatCount(report.traffic.sessions)} />
                <StatTile label="Engaged sessions" value={formatCount(report.traffic.engagedSessions)} />
                <StatTile label="Engagement rate" value={formatRatioAsPercent(report.traffic.engagementRate)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acquisition</CardTitle>
              <CardDescription>
                Sessions by GA4&apos;s own default channel grouping. This platform does not invent its own channel
                taxonomy — these are Google&apos;s channel names, unchanged.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.acquisition.length === 0 ? (
                <p className="text-sm text-muted">No acquisition data in the reported range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead numeric>Sessions</TableHead>
                      <TableHead numeric>Users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.acquisition.map((row) => (
                      <TableRow key={row.channel}>
                        <TableCell>{row.channel}</TableCell>
                        <TableCell numeric>{row.sessions.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{row.users.toLocaleString("en-US")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Landing pages</CardTitle>
              <CardDescription>
                Top {report.pages.length.toLocaleString("en-US")} landing pages by views. Average engagement time is
                GA4&apos;s standard derivation (engagement duration ÷ users), not a separate metric Google returns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.pages.length === 0 ? (
                <p className="text-sm text-muted">No page data in the reported range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Landing page</TableHead>
                      <TableHead numeric>Views</TableHead>
                      <TableHead numeric>Users</TableHead>
                      <TableHead numeric>Avg. engagement time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.pages.map((row) => (
                      <TableRow key={row.landingPage}>
                        <TableCell>
                          <span
                            className="block max-w-sm truncate"
                            title={decodeLandingPage(row.landingPage)}
                          >
                            {decodeLandingPage(row.landingPage)}
                          </span>
                        </TableCell>
                        <TableCell numeric>{row.views.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{row.users.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{formatDuration(row.averageEngagementTimeSeconds)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversion</CardTitle>
              <CardDescription>Key events, as configured in this GA4 property.</CardDescription>
            </CardHeader>
            <CardContent>
              {!report.conversion.hasKeyEvents ? (
                <Alert variant="info">
                  <p className="font-semibold">No key events recorded</p>
                  <p className="mt-0.5 text-sm text-secondary-foreground">
                    Either no key events (conversions) are configured for this property, or none occurred in this
                    range. Those are different situations and Google&apos;s report cannot tell them apart, so no
                    conversion rate is shown rather than a 0% that would claim the first.
                  </p>
                </Alert>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="Key events" value={formatCount(report.conversion.keyEvents)} />
                  <StatTile label="Sessions" value={formatCount(report.conversion.sessions)} />
                  <StatTile label="Conversion rate" value={formatRatioAsPercent(report.conversion.conversionRate)} />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
