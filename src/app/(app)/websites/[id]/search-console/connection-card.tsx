import { PlugZap } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ConnectSearchConsoleButton,
  GscConnectionActions,
  GscOAuthBanner,
  GscPropertyPicker,
} from "@/components/report/gsc-actions";

import type { SearchConsoleReportData } from "./data";

/**
 * The connection card every Search Console route shows.
 *
 * FIVE STATES, NEVER COLLAPSED INTO TWO. Each one is a genuinely different
 * situation with a different next action, and flattening them would make the
 * commonest support question ("why is it empty?") unanswerable from the
 * screen:
 *
 *   not-configured → the server has no Google OAuth credentials at all.
 *   not-connected  → nobody has linked a Google account to this website.
 *   no-property    → a Google account is linked but no property is chosen.
 *   no-data        → a property is chosen but no sync has ever produced rows.
 *   ready          → real synced rows exist.
 *
 * Critically, `no-data` renders a SENTENCE, not a KPI row of zeros. "Connected,
 * but no data synced yet" and "0 clicks, 0 impressions" are opposite claims,
 * and showing the second when the first is true would be the worst fabrication
 * available on this page.
 *
 * A FAILED LAST SYNC IS SHOWN EVEN WHEN OLDER DATA EXISTS. Google's error is
 * quoted verbatim, and the data below is labelled with the range it actually
 * came from — so a stale-but-real report is never passed off as current.
 */
export function GscConnectionCard({ websiteId, data }: { websiteId: string; data: SearchConsoleReportData }) {
  if (data.state === "not-configured") {
    return (
      <Alert variant="warning">
        <p className="font-semibold">Google Search Console integration is not configured</p>
        <p className="mt-0.5 text-sm text-secondary-foreground">
          An administrator must add Google OAuth credentials (<code>GOOGLE_CLIENT_ID</code>,{" "}
          <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_OAUTH_REDIRECT_URI</code>) to the environment before this
          feature can be used.
        </p>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>
          Read-only access to your own Search Console property. Data is refreshed only when you click &ldquo;Sync
          now&rdquo; — never automatically on page load, so opening this report never spends Google API quota.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <GscOAuthBanner />

        {data.state === "not-connected" && (
          <EmptyState
            icon={PlugZap}
            title="Connect Search Console"
            description="No Google account is linked to this website yet. Nothing on this report can be measured until one is."
          >
            <ConnectSearchConsoleButton websiteId={websiteId} />
          </EmptyState>
        )}

        {data.state === "no-property" && (
          <>
            <p className="text-sm font-medium text-secondary-foreground">
              Connected to Google, but no Search Console property has been selected for this website yet.
            </p>
            <GscPropertyPicker websiteId={websiteId} />
          </>
        )}

        {(data.state === "no-data" || data.state === "ready") && data.connection && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-secondary-foreground">
                  Connected property:{" "}
                  <span className="font-medium break-all text-foreground">{data.connection.propertyUrl}</span>
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>
                    Last sync:{" "}
                    {data.connection.lastSyncCompletedAt
                      ? data.connection.lastSyncCompletedAt.toLocaleString("en-US")
                      : "never"}
                  </span>
                  <Badge variant={syncVariant(data.connection.lastSyncStatus)}>{data.connection.lastSyncStatus}</Badge>
                  {data.state === "ready" && data.stale && <Badge variant="unknown">Older than 6 hours</Badge>}
                </p>
              </div>
              <GscConnectionActions websiteId={websiteId} />
            </div>

            {data.lastSyncFailed && data.connection.lastSyncError && (
              <Alert variant="error">
                <p className="font-semibold">The last sync attempt failed</p>
                <p className="mt-0.5 text-sm text-secondary-foreground">
                  {data.state === "ready"
                    ? "The figures below are real, but they come from the last sync that succeeded — they are not current. Reconnect the Google account and sync again to refresh them."
                    : "No data has ever been synced for this property."}
                </p>
                <p className="mt-1 font-mono text-xs break-words text-muted">{data.connection.lastSyncError}</p>
              </Alert>
            )}

            {data.state === "no-data" && (
              <Alert variant="info">
                <p className="font-semibold">Connected, but no data synced yet</p>
                <p className="mt-0.5 text-sm text-secondary-foreground">
                  A property is selected and nothing has been pulled from Google yet. This is an absence of data, not
                  a measurement of zero — click &ldquo;Sync now&rdquo; to fetch the last 28 days.
                </p>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function syncVariant(status: string) {
  if (status === "completed") return "good" as const;
  if (status === "failed") return "critical" as const;
  if (status === "running") return "accent" as const;
  return "unknown" as const;
}
