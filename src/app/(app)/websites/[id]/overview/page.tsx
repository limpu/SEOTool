import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditWebsiteForm } from "@/components/website/edit-website-form";
import { DeleteWebsiteButton } from "@/components/website/delete-website-button";
import { formatUpdatedAt } from "@/components/charts/format";

import { loadOverviewData } from "./data";
import {
  AiReadinessWidget,
  AnalyticsWidget,
  CompetitorsWidget,
  HealthHero,
  KeywordsWidget,
  ModulesWidget,
  PageSpeedWidget,
  RecommendationsWidget,
  SearchConsoleWidget,
  SeverityWidget,
  TrustWidget,
} from "./widgets";

/**
 * Website Overview — the product's dashboard.
 *
 * A Server Component that does ALL of the fetching (`loadOverviewData`) and
 * hands each chart already-computed, plain-serializable props. recharts is
 * client-only, so the charts are thin `"use client"` leaves; nothing on this
 * page fetches from the browser.
 *
 * Every widget below is fed by an existing compute/query function and shows an
 * honest empty state when its prerequisite is missing — "No crawl yet",
 * "Not assessed", "Connect Search Console". Nothing is ever substituted with a
 * 0, and a measured 0 (zero critical issues) is rendered as the real, good
 * result it is, visibly different from "not measured".
 */
export default async function WebsiteOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { site, user } = await requireWorkspacePage(id, "overview");

  const data = await loadOverviewData(site.id, user.id);

  const lastCrawlAt = data.lastCrawl?.completedAt ?? data.lastCrawl?.startedAt ?? null;
  const lastCrawlLabel = formatUpdatedAt(lastCrawlAt);

  return (
    <div className="space-y-5">
      {/* ─── 1. Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-foreground">{site.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-secondary-foreground hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {site.url}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <span className="text-xs text-muted">
              {lastCrawlLabel ? `Last crawl: ${lastCrawlLabel}` : "Never crawled"}
            </span>
            {data.lastCrawl && data.lastCrawl.status !== "completed" && (
              <Badge variant="warning">Crawl {data.lastCrawl.status}</Badge>
            )}
          </div>
        </div>

        <Link
          href={`/websites/${site.id}/site-audit`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Run / view crawl
        </Link>
      </header>

      {/* ─── Widget grid ───────────────────────────────────────────────────
          One column on mobile, two from `lg`. Hero/table widgets opt into
          `lg:col-span-2` themselves. Every wide table or chart scrolls inside
          its own container, so the page body never scrolls horizontally. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HealthHero data={data} websiteId={site.id} />
        <SeverityWidget data={data} websiteId={site.id} />
        <ModulesWidget data={data} websiteId={site.id} />
        <RecommendationsWidget data={data} websiteId={site.id} />
        <PageSpeedWidget data={data} websiteId={site.id} />
        <AiReadinessWidget data={data} websiteId={site.id} />
        <TrustWidget data={data} websiteId={site.id} />
        <SearchConsoleWidget data={data} websiteId={site.id} />
        <AnalyticsWidget data={data} websiteId={site.id} />
        <KeywordsWidget data={data} websiteId={site.id} />
        <CompetitorsWidget data={data} websiteId={site.id} />
      </div>

      {/* ─── 11. Settings + danger zone, de-emphasised at the very bottom ──
          `id="edit-website"` is a deep-link target: the dashboard's Edit icon
          links to `/websites/<id>/overview#edit-website`. Do not rename it. */}
      <Card id="edit-website" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Website settings</CardTitle>
          <CardDescription>Name, URL and crawl limits for this site.</CardDescription>
        </CardHeader>
        <CardContent>
          <EditWebsiteForm website={site} />
        </CardContent>
      </Card>

      <Card className="border-destructive-border">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deleting a website permanently removes it and all of its audit data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteWebsiteButton websiteId={site.id} websiteName={site.name} />
        </CardContent>
      </Card>
    </div>
  );
}
