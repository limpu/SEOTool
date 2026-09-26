import { Braces, SearchCheck } from "lucide-react";

import { UpgradeRequired } from "@/components/website/upgrade-required";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/charts/stat-tile";
import { formatCount } from "@/components/charts/format";
import { ModuleSeverityKpis, ModuleTopicGrid, ModuleTopIssues } from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport } from "../_module-report/data";

/**
 * Schema → Overview tab.
 *
 * THE HONESTY PROBLEM THIS PAGE EXISTS TO SOLVE
 * ---------------------------------------------
 * "0 schema issues" is ambiguous in a way no other module's zero is. A site
 * whose structured data is flawless and a site with no structured data at all
 * produce the identical zero, and showing both as a clean pass would be a
 * fabricated verdict — arguably the worst one in this product, since the
 * second site is the one that actually needs work.
 *
 * The two ARE distinguishable from real data: Phase 11 writes a `schemas` row
 * for every JSON-LD block it finds, and writes nothing when it finds none. So
 * this Overview leads with the INVENTORY — how many blocks, on how many pages,
 * of which types, how many parsed — and only then shows the issue counts. When
 * the inventory is empty the page says "No structured data found" in as many
 * words and explicitly states that this is not a pass.
 *
 * `pagesWithoutSchema` is a real subtraction of two measured counts (pages in
 * the completed crawl minus pages carrying at least one block), so it is a
 * measurement, not an inference.
 */
export default async function SchemaOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("schema", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "schema");
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const stats = data.schemaStats;
  const pagesScanned = data.report.pagesScanned;
  const hasMarkup = stats !== null && stats.totalBlocks > 0;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("schema", issue.category),
  }));

  const noMarkupNote = (
    <p className="text-center text-xs text-muted">
      This site published no structured data at all in the last crawl, so there was nothing for these rules to fail on.
      Zero findings here is not a clean pass.
    </p>
  );

  return (
    <div className="space-y-5">
      {/* ─── 1. The inventory. Always first — it is what disambiguates the zero. ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Structured data found</CardTitle>
          <CardDescription>
            Every JSON-LD block the crawler parsed out of the pages in the most recent completed crawl.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!data.hasCompletedCrawl ? (
            <EmptyState
              icon={SearchCheck}
              title="No crawl yet"
              description="Structured data is only known after a crawl has completed."
              actionLabel="Go to crawl history"
              actionHref={crawlHistoryHref}
            />
          ) : !hasMarkup ? (
            <EmptyState
              icon={Braces}
              title="No structured data found"
              description={`The last completed crawl parsed ${pagesScanned.toLocaleString(
                "en-US"
              )} page${pagesScanned === 1 ? "" : "s"} and found no JSON-LD markup on any of them. This is an absence of markup, not a clean validation result — the checks below had nothing to run against.`}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Markup blocks" value={formatCount(stats.totalBlocks)} />
                <StatTile
                  label="Pages with markup"
                  value={formatCount(stats.pagesWithSchema)}
                  footer={
                    pagesScanned > 0
                      ? `of ${pagesScanned.toLocaleString("en-US")} pages scanned (${Math.round(
                          (stats.pagesWithSchema / pagesScanned) * 100
                        )}%)`
                      : undefined
                  }
                />
                <StatTile
                  label="Pages without markup"
                  value={formatCount(Math.max(0, pagesScanned - stats.pagesWithSchema))}
                  hint="A measured count, not an estimate"
                />
                <StatTile
                  label="Blocks that did not parse"
                  value={formatCount(stats.invalidBlocks)}
                  footer={`${stats.validBlocks.toLocaleString("en-US")} parsed cleanly`}
                />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">Detected types</h2>
                <p className="mt-0.5 mb-2 text-xs text-secondary-foreground">
                  Each <span className="font-mono">@type</span> the crawler saw, with how many blocks declared it and
                  how many distinct pages carry it.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead numeric>Blocks</TableHead>
                      <TableHead numeric>Pages</TableHead>
                      <TableHead numeric>Parsed</TableHead>
                      <TableHead numeric>Did not parse</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.types.map((type) => (
                      <TableRow key={type.type ?? "__untyped__"}>
                        <TableCell>
                          {type.type ? (
                            <span className="font-medium text-foreground">{type.type}</span>
                          ) : (
                            // A block with no `@type` is its own real finding,
                            // never merged into a named type or dropped.
                            <Badge variant="warning">No @type declared</Badge>
                          )}
                        </TableCell>
                        <TableCell numeric>{type.blocks.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{type.pageCount.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{type.validBlocks.toLocaleString("en-US")}</TableCell>
                        <TableCell numeric>{type.invalidBlocks.toLocaleString("en-US")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 2. Issue counts, framed by what the inventory just said. ─── */}
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Markup findings by severity"
        description={
          hasMarkup
            ? "Validation and consistency findings against the structured data listed above."
            : "Validation and consistency findings. With no markup detected, these rules had nothing to evaluate — a zero below means absence, not correctness."
        }
      />

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By schema area"
        description="Every area with at least one finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyTitle={hasMarkup ? "No markup problems found" : "No structured data to check"}
        emptyDescription={
          hasMarkup
            ? "Every structured-data block found in the last completed crawl passed these checks."
            : "The last completed crawl found no JSON-LD markup on this site."
        }
        emptyExtra={!hasMarkup && data.hasCompletedCrawl ? noMarkupNote : undefined}
      />
    </div>
  );
}
