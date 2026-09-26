import type { ReactNode } from "react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportHeader, type ReportChip } from "@/components/report/report-header";
import { ReportTabs } from "@/components/report/report-tabs";

import { loadSearchConsoleReport } from "./data";

/**
 * Stage 3B — shared chrome for the Search Console report.
 *
 * WHY THREE TABS, AND WHY NOT FOUR
 * --------------------------------
 * Overview answers "how is search traffic doing overall". Queries and Pages
 * are two genuinely DIFFERENT dimensions that Google returns and this platform
 * genuinely persists (`runGscSync` requests `dimensions: ["query"]` and
 * `dimensions: ["page"]` and stores both, tagged `dimensionType`). Each is a
 * long record list a user scans and sorts on its own terms, so each earns its
 * own route.
 *
 * There is deliberately NO Countries or Devices tab. Those dimensions are
 * never requested from Google and no column for them exists in `gsc_metrics` —
 * a tab for them could only ever be empty, which would advertise a capability
 * the product does not have. The Overview says so in as many words rather than
 * leaving the omission to be noticed.
 *
 * The tab COUNTS are real row counts from the last completed sync, and are
 * `undefined` (no badge at all) rather than 0 when nothing has been synced —
 * "not applicable" and "zero rows" are different facts.
 */
export default async function SearchConsoleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { site, access } = await requireWorkspacePage(id, "search-console");
  if (!access.entitled) return <UpgradeRequired label="Search Console" />;

  const data = await loadSearchConsoleReport(site.id);
  const ready = data.state === "ready";

  const chips: ReportChip[] = [
    {
      label: "Property",
      // Three distinct facts, never collapsed: no Google account linked at
      // all, a linked account with no property chosen, and a chosen property.
      value:
        data.connection?.propertyUrl ??
        (data.connection ? "Connected — no property selected" : "Not connected"),
    },
    {
      label: "Date range",
      value: ready && data.dateRangeStart && data.dateRangeEnd
        ? `${data.dateRangeStart} → ${data.dateRangeEnd}`
        : "No sync yet",
      title: "The 28-day window the last completed sync requested from Google, matching Search Console's own default.",
    },
    {
      label: "Last sync",
      value: data.connection?.lastSyncStatus ?? "Never",
      tone:
        data.connection?.lastSyncStatus === "completed"
          ? "good"
          : data.connection?.lastSyncStatus === "failed"
            ? "critical"
            : "unknown",
    },
  ];

  const base = `/websites/${site.id}/search-console`;

  return (
    <div className="space-y-5">
      <ReportHeader title="Search Console" siteName={site.name} siteUrl={site.url} chips={chips} />

      <ReportTabs
        tabs={[
          { label: "Overview", href: base },
          { label: "Queries", href: `${base}/queries`, count: ready ? data.queries.length : undefined },
          { label: "Pages", href: `${base}/pages`, count: ready ? data.pages.length : undefined },
        ]}
      />

      {children}
    </div>
  );
}
