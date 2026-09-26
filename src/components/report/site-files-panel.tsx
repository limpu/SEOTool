import { FileSearch } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteFileCard } from "@/components/report/site-file-card";
import { AddSiteFileForm } from "@/components/report/site-file-actions";
import type { SiteFileEntry } from "@/lib/site-files/queries";
import type { SiteFileType } from "@/lib/site-files/fetch";

/**
 * Phase 37 — the shared "the actual files" panel used by the Sitemap,
 * Robots.txt and AI Search reports.
 *
 * SERVER COMPONENT. Every entry it renders was already in the database when
 * the request arrived; opening a report never triggers an outbound fetch.
 *
 * The empty state is the "never checked" case and says so plainly, so it can
 * never be confused with a stored row whose `found` is false — that is a
 * measured absence and renders as a real card with a real status.
 */
export function SiteFilesPanel({
  websiteId,
  title,
  description,
  entries,
  crawlHistoryHref,
  allowedTypes,
  defaultType,
  extraFactsFor,
  labelFor,
}: {
  websiteId: string;
  title: string;
  description: string;
  entries: SiteFileEntry[];
  crawlHistoryHref: string;
  allowedTypes: SiteFileType[];
  defaultType: SiteFileType;
  extraFactsFor?: (entry: SiteFileEntry) => { label: string; value: string }[];
  labelFor?: (entry: SiteFileEntry) => string;
}) {
  const discovered = entries.filter((entry) => entry.source === "discovered");
  const manual = entries.filter((entry) => entry.source === "manual");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-secondary-foreground uppercase">
            Found by the crawler
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Recorded during the most recent completed crawl. These are replaced by the next crawl, so they cannot be
            removed by hand.
          </p>
          {discovered.length === 0 ? (
            <div className="mt-2">
              <EmptyState
                icon={FileSearch}
                title="Never checked"
                description="No completed crawl has recorded this file for this site yet. This is an absence of data, not a finding that the file is missing."
                actionLabel="Go to crawl history"
                actionHref={crawlHistoryHref}
              />
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {discovered.map((entry) => (
                <SiteFileCard
                  key={entry.id}
                  websiteId={websiteId}
                  entry={entry}
                  extraFacts={extraFactsFor?.(entry)}
                  label={labelFor?.(entry)}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-secondary-foreground uppercase">Added by hand</h3>
          <p className="mt-0.5 text-xs text-muted">
            Files you pointed this platform at yourself. They survive crawls, and only these can be removed.
          </p>
          {manual.length === 0 ? (
            <p className="mt-2 text-sm text-secondary-foreground">None added.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {manual.map((entry) => (
                <SiteFileCard
                  key={entry.id}
                  websiteId={websiteId}
                  entry={entry}
                  extraFacts={extraFactsFor?.(entry)}
                  label={labelFor?.(entry)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-default pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-secondary-foreground uppercase">Add a file</h3>
          <p className="mt-0.5 mb-2 text-xs text-muted">
            Point this platform at a file the crawler did not find. It is fetched once, now, and stored — an HTML
            sitemap is recorded as a link only and is never downloaded.
          </p>
          <AddSiteFileForm websiteId={websiteId} allowedTypes={allowedTypes} defaultType={defaultType} />
        </section>
      </CardContent>
    </Card>
  );
}
