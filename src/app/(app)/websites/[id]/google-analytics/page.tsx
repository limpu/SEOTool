import Link from "next/link";
import { Info, PlugZap } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { getGa4Connection } from "@/lib/ga4/queries";
import { isGa4Configured } from "@/lib/ga4/config";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportHeader, type ReportChip } from "@/components/report/report-header";
import { MetricCard } from "@/components/report/metrics";
import { formatCount, formatRatioAsPercent } from "@/components/charts/format";
import { POSITION_HINT } from "@/components/report/position";
import { PositionValue } from "@/components/report/position-display";
import {
  ConnectGa4Button,
  Ga4DisconnectButton,
  Ga4LiveReport,
  Ga4OAuthBanner,
  Ga4PropertyPicker,
} from "@/components/report/ga4-report";

import { loadSearchConsoleReport } from "../search-console/data";

/**
 * Google Analytics — the whole report is ONE page, deliberately.
 *
 * ─── WHY THIS MODULE HAS NO TABS ─────────────────────────────────────────
 *
 * Tabs need something to navigate BETWEEN, and something to count. This module
 * has neither, for one structural reason: **nothing is persisted**. There is
 * no `ga4_metrics` table; `/api/websites/[id]/ga4/report` calls Google's Data
 * API live and returns the parsed result, and that is the entire data layer.
 *
 * So on arrival the server knows exactly two things — whether a connection
 * exists and which property it points at. It cannot count sessions, landing
 * pages or channels, because it has not asked Google and (per the rule below)
 * must not. A tab bar would therefore have to render three tabs with no
 * counts, two of which would be empty until a button in the third was
 * clicked. That is chrome pretending to be structure. The four report
 * sections are four cards on one page, revealed together when the user asks
 * for them, which is what the data actually supports.
 *
 * ═══ GA4 MUST NOT AUTO-FETCH ON PAGE LOAD ════════════════════════════════
 *
 * This Server Component calls Google ZERO times. It reads one row from
 * `google_analytics_connections` and stops. Every `runReport` call happens
 * behind the explicit "Load report" button inside `Ga4LiveReport`. That is the
 * Phase 36 decision preserved verbatim — quota (30 report calls/hour, four
 * Google requests each), latency (four round trips in front of the render),
 * and the fact that an expired Google token must never be able to break or
 * 500 this page. `Ga4NotConnectedError`, `Ga4NoPropertySelectedError` and
 * `Ga4ApiError` are already converted to JSON errors by the API route and are
 * rendered as honest messages, never as a zeroed report.
 *
 * ─── The Search Console comparison ───────────────────────────────────────
 *
 * The retired panel embedded the whole `GscPanel` underneath for a
 * side-by-side look. That comparison is preserved — as a compact,
 * server-rendered summary of the ALREADY-SYNCED Search Console figures, which
 * costs no Google call at all — and links to the full Search Console report
 * rather than shipping a second copy of its connect/sync/disconnect controls
 * on a page about Analytics.
 */
export default async function GoogleAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "google-analytics");
  if (!access.entitled) return <UpgradeRequired label="Google Analytics" />;

  const configured = isGa4Configured();
  // One row. No Google API call. This is the whole server-side data layer for
  // this module, and that is not an omission — see the note above.
  const connection = await getGa4Connection(site.id);
  const gsc = await loadSearchConsoleReport(site.id);

  const chips: ReportChip[] = [
    {
      label: "Property",
      value: connection?.propertyName?.trim() || connection?.propertyId || (connection ? "No property selected" : "Not connected"),
    },
    {
      label: "Data",
      value: "Fetched on request",
      title: "This platform stores no Analytics history. Nothing is read from Google until you click Load report.",
    },
    {
      label: "Range",
      value: "Last 28 days",
    },
  ];

  return (
    <div className="space-y-5">
      <ReportHeader title="Google Analytics" siteName={site.name} siteUrl={site.url} chips={chips} />

      <p className="flex items-start gap-2 rounded-lg border border-default bg-surface-subtle px-3 py-2 text-xs text-secondary-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span>
          Read-only access to your own GA4 property. This report has{" "}
          <strong className="font-semibold">no Overview / Detail tabs</strong> because nothing is stored: there is no
          Analytics history table in this platform, so every figure is read live from Google at the moment you ask for
          it, and there is nothing for a server-rendered overview to summarise.
        </span>
      </p>

      <Ga4OAuthBanner />

      {!configured && (
        <Alert variant="warning">
          <p className="font-semibold">Google Analytics integration is not configured</p>
          <p className="mt-0.5 text-sm text-secondary-foreground">
            An administrator must add Google OAuth credentials (<code>GOOGLE_CLIENT_ID</code>,{" "}
            <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_GA4_OAUTH_REDIRECT_URI</code>) to the environment before
            this feature can be used.
          </p>
        </Alert>
      )}

      {configured && !connection && (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={PlugZap}
              title="Connect Google Analytics"
              description="No Google account is linked to this website yet. Nothing on this report can be measured until one is."
            >
              <ConnectGa4Button websiteId={site.id} />
            </EmptyState>
          </CardContent>
        </Card>
      )}

      {configured && connection && !connection.propertyId && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a GA4 property</CardTitle>
            <CardDescription>
              Connected to Google, but no Analytics property has been selected for this website yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Ga4PropertyPicker websiteId={site.id} />
          </CardContent>
        </Card>
      )}

      {configured && connection && connection.propertyId && (
        <>
          <Card>
            <CardHeader
              action={<Ga4DisconnectButton websiteId={site.id} />}
            >
              <CardTitle>Connection</CardTitle>
              <CardDescription>
                Connected property:{" "}
                <span className="font-medium text-foreground">
                  {connection.propertyName?.trim() || connection.propertyId}
                </span>{" "}
                <span className="text-muted">({connection.propertyId})</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted">
                Loading this page has not contacted Google. The report below is fetched only when you ask for it.
              </p>
            </CardContent>
          </Card>

          <Ga4LiveReport websiteId={site.id} />
        </>
      )}

      <Card>
        <CardHeader
          action={
            <Link
              href={`/websites/${site.id}/search-console`}
              className="rounded-sm text-xs font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Full Search Console report →
            </Link>
          }
        >
          <CardTitle>Search Console, for comparison</CardTitle>
          <CardDescription>
            {gsc.state === "ready"
              ? `Already-synced Search Console figures for ${gsc.dateRangeStart} → ${gsc.dateRangeEnd}. Read from this platform's own database — no Google call was made to show these.`
              : "Search Console figures would appear here for side-by-side comparison."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gsc.state === "ready" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Clicks" value={formatCount(gsc.queryTotals.clicks)} />
              <MetricCard label="Impressions" value={formatCount(gsc.queryTotals.impressions)} />
              <MetricCard label="CTR" value={formatRatioAsPercent(gsc.queryTotals.ctr, 2)} />
              <div className="rounded-lg border border-default p-3">
                <p className="text-xs font-medium text-secondary-foreground">Average position</p>
                <p className="mt-0.5 text-[11px] text-muted">{POSITION_HINT}</p>
                <p className="mt-2 text-2xl leading-none font-bold">
                  <PositionValue position={gsc.queryTotals.position} unavailable="Not measured" />
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              title={
                gsc.state === "not-configured"
                  ? "Search Console is not configured"
                  : gsc.state === "not-connected"
                    ? "Connect Search Console"
                    : gsc.state === "no-property"
                      ? "Connected, but no property selected"
                      : "Connected, but no data synced yet"
              }
              description="Nothing is shown here rather than a zeroed row — an absent connection is not a measurement of zero traffic."
              actionLabel="Go to the Search Console report"
              actionHref={`/websites/${site.id}/search-console`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
