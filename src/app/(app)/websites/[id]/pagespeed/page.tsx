import { FlaskConical, Gauge as GaugeIcon, ListChecks } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import {
  ModuleSeverityKpis,
  ModuleTopicGrid,
  ModuleTopIssues,
} from "@/components/report/module-overview";
import { topicLabel } from "@/components/report/module-definitions";
import { IssueSeverityBadge } from "@/components/report/issue-severity-badge";
import { RunPageSpeedButton } from "@/components/report/run-pagespeed-button";
import {
  classifyCategoryScore,
  classifyCls,
  classifyInp,
  classifyLcp,
  vitalStatusLabel,
  vitalStatusVariant,
  CWV_POOR_THRESHOLDS,
  type VitalStatus,
} from "@/components/report/vitals";
import { CWV_THRESHOLDS } from "@/lib/pagespeed/evaluate-thresholds";
import { formatCls, formatMilliseconds, formatUpdatedAt } from "@/components/charts/format";

import { requireModulePage } from "../_module-report/chrome";
import { loadModuleReport, type PageSpeedAuditView, type PageSpeedStrategy } from "../_module-report/data";

/**
 * PageSpeed → Overview tab.
 *
 * WHAT LEADS HERE, AND WHY IT IS NOT THE SHARED SEVERITY GRID.
 *
 * Every other issue-based module's headline fact is "how many findings". This
 * module's is not. Phase 20 runs real Google Lighthouse locally and persists
 * four category scores plus Core Web Vitals per strategy in `pagespeed_audits`
 * — measurements that exist whether or not a single `PAGESPEED_` rule ever
 * fires, and that are the answer to the question this page's user actually
 * arrived with. So the Lighthouse results lead, and the diagnostic issue
 * counts follow underneath.
 *
 * ─── Three honesty rules this page is built around ───────────────────────
 *
 * 1. LAB, NOT FIELD. Everything here is Lighthouse's own simulated
 *    lab measurement of a single load from this server. It is NOT Chrome UX
 *    Report field data and NOT what Google's ranking systems observe from real
 *    users. This platform collects no field data at all, so the page says that
 *    outright instead of letting "Core Web Vitals" imply otherwise.
 *
 * 2. INP IS `null`, AND `null` IS NOT ZERO AND NOT "POOR". Lighthouse's lab
 *    mode has no real interactions to time, so INP is legitimately unmeasured
 *    on every audit in this dataset. It renders as "Not measured" with the
 *    neutral `unknown` badge — never 0, never a failing verdict.
 *
 * 3. A MISSING AUDIT IS NOT A BAD SCORE. A site nobody has audited gets an
 *    honest call to action, not a zero.
 *
 * Server Component. `loadModuleReport(...)` is `cache()`d and shared with the
 * layout, so the whole page is one fetch.
 */

const STRATEGY_LABEL: Record<PageSpeedStrategy, string> = { mobile: "Mobile", desktop: "Desktop" };

const CATEGORY_FIELDS = [
  { key: "performanceScore", label: "Performance" },
  { key: "accessibilityScore", label: "Accessibility" },
  { key: "bestPracticesScore", label: "Best Practices" },
  { key: "seoScore", label: "SEO" },
] as const;

function StatusBadge({ status }: { status: VitalStatus }) {
  return <Badge variant={vitalStatusVariant(status)}>{vitalStatusLabel(status)}</Badge>;
}

/** One Lighthouse category score: the number, and the verdict in words beside it. */
function CategoryScore({ label, score }: { label: string; score: number | null }) {
  const status = classifyCategoryScore(score);
  return (
    <div className="rounded-lg border border-default p-3">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      {score === null ? (
        <p className="mt-1.5 text-sm leading-tight font-medium text-muted">Not measured</p>
      ) : (
        <p className="mt-1 text-2xl leading-none font-bold text-foreground">{score}</p>
      )}
      <div className="mt-2">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

/**
 * One strategy's four category scores, or an explicit statement that this
 * strategy has no completed audit. Mobile and desktop are separate runs and a
 * batch can legitimately have one without the other.
 */
function StrategyScores({ strategy, audit }: { strategy: PageSpeedStrategy; audit: PageSpeedAuditView | null }) {
  return (
    <section className="rounded-lg border border-default p-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">{STRATEGY_LABEL[strategy]}</h3>
        {audit ? (
          <p className="text-xs text-muted">
            {formatUpdatedAt(audit.completedAt ?? audit.createdAt) ?? "Date not recorded"}
            {audit.lighthouseVersion ? ` · Lighthouse ${audit.lighthouseVersion}` : ""}
          </p>
        ) : null}
      </div>

      {audit === null ? (
        <p className="text-sm text-muted">
          No completed {STRATEGY_LABEL[strategy].toLowerCase()} audit. Nothing is shown for this strategy rather than
          a score borrowed from the other one.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORY_FIELDS.map((field) => (
            <CategoryScore key={field.key} label={field.label} score={audit[field.key]} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A metric cell: the real value, or the honest missing-value wording. Never a substituted number. */
function MetricCell({ text, available }: { text: string; available: boolean }) {
  return available ? (
    <span className="tabular font-semibold text-foreground">{text}</span>
  ) : (
    <span className="font-medium text-muted">{text}</span>
  );
}

export default async function PageSpeedOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { definition, site, access } = await requireModulePage("pagespeed", id);
  if (!access.entitled) return <UpgradeRequired label={definition.label} />;

  const data = await loadModuleReport(site.id, "pagespeed");
  const pageSpeed = data.pageSpeed;
  const base = `/websites/${site.id}/${definition.slug}`;
  const issuesPath = `${base}/issues`;
  const crawlHistoryHref = `/websites/${site.id}/site-audit#crawl-history`;

  const mobile = pageSpeed?.latest.mobile ?? null;
  const desktop = pageSpeed?.latest.desktop ?? null;
  const hasAnyCompletedAudit = mobile !== null || desktop !== null;

  const previewIssues = data.issues.slice(0, 6).map((issue) => ({
    ...issue,
    href: `${issuesPath}/${encodeURIComponent(issue.ruleKey)}`,
    categoryLabel: topicLabel("pagespeed", issue.category),
  }));

  // Core Web Vitals, one row per metric, one column per strategy. A table
  // rather than a chart: each cell needs a value, a unit, a verdict badge and
  // — for INP — a whole sentence explaining why there is no number at all.
  const vitalRows = [
    {
      key: "lcp",
      label: "Largest Contentful Paint (LCP)",
      goodThreshold: `≤ ${(CWV_THRESHOLDS.lcpMs / 1000).toFixed(1)} s`,
      poorThreshold: `> ${(CWV_POOR_THRESHOLDS.lcpMs / 1000).toFixed(1)} s`,
      cell: (audit: PageSpeedAuditView | null) => {
        const value = audit?.lcp ?? null;
        return { display: formatMilliseconds(value), status: classifyLcp(value) };
      },
    },
    {
      key: "cls",
      label: "Cumulative Layout Shift (CLS)",
      goodThreshold: `≤ ${CWV_THRESHOLDS.cls}`,
      poorThreshold: `> ${CWV_POOR_THRESHOLDS.cls}`,
      cell: (audit: PageSpeedAuditView | null) => {
        const value = audit?.cls ?? null;
        return { display: formatCls(value), status: classifyCls(value) };
      },
    },
    {
      key: "inp",
      label: "Interaction to Next Paint (INP)",
      goodThreshold: `≤ ${CWV_THRESHOLDS.inpMs} ms`,
      poorThreshold: `> ${CWV_POOR_THRESHOLDS.inpMs} ms`,
      cell: (audit: PageSpeedAuditView | null) => {
        const value = audit?.inp ?? null;
        return { display: formatMilliseconds(value), status: classifyInp(value) };
      },
    },
  ];

  const supportingRows = [
    { key: "fcp", label: "First Contentful Paint", read: (a: PageSpeedAuditView | null) => formatMilliseconds(a?.fcp ?? null) },
    { key: "tbt", label: "Total Blocking Time", read: (a: PageSpeedAuditView | null) => formatMilliseconds(a?.tbt ?? null) },
    { key: "si", label: "Speed Index", read: (a: PageSpeedAuditView | null) => formatMilliseconds(a?.speedIndex ?? null) },
    { key: "ttfb", label: "Server response time (TTFB)", read: (a: PageSpeedAuditView | null) => formatMilliseconds(a?.ttfb ?? null) },
  ];

  const inpUnmeasuredEverywhere =
    hasAnyCompletedAudit && (mobile?.inp ?? null) === null && (desktop?.inp ?? null) === null;

  const auditedUrl = mobile?.url ?? desktop?.url ?? null;
  const diagnosticStrategies: { strategy: PageSpeedStrategy; audit: PageSpeedAuditView }[] = [
    ...(mobile ? [{ strategy: "mobile" as const, audit: mobile }] : []),
    ...(desktop ? [{ strategy: "desktop" as const, audit: desktop }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* ─── 1. The lead: real Lighthouse category scores ─────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Lighthouse scores</CardTitle>
          <CardDescription>
            Google Lighthouse run locally against{" "}
            {auditedUrl ? <span className="font-mono break-all">{auditedUrl}</span> : "this site"}, once per strategy.
            Each score is out of 100 and is Lighthouse&apos;s own measurement of a single simulated page load.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pageSpeed?.everRan ? (
            <EmptyState
              icon={GaugeIcon}
              title="No PageSpeed audit has run yet"
              description="Lighthouse audits are explicitly triggered — nothing about this site's speed has been measured. This is an absence of data, not a score of zero."
            >
              <RunPageSpeedButton websiteId={site.id} initialActive={false} hasEverRun={false} />
            </EmptyState>
          ) : (
            <>
              {pageSpeed.activeRun && (
                <Alert variant="info">
                  An audit is running now. The results below are from the last completed run and are not yet updated.
                </Alert>
              )}
              {!hasAnyCompletedAudit && (
                <Alert variant="warning">
                  Audits have been started for this site, but none has completed successfully — so there are no scores
                  to show. See the audit history below for each run&apos;s status.
                </Alert>
              )}
              {hasAnyCompletedAudit && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <StrategyScores strategy="mobile" audit={mobile} />
                  <StrategyScores strategy="desktop" audit={desktop} />
                </div>
              )}
              <RunPageSpeedButton
                websiteId={site.id}
                initialActive={pageSpeed.activeRun}
                hasEverRun={pageSpeed.everRan}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 2. Core Web Vitals, explicitly labelled as lab data ──────── */}
      <Card>
        <CardHeader>
          <CardTitle>Core Web Vitals — lab data</CardTitle>
          <CardDescription>
            Measured by Lighthouse in a simulated environment on this server. Thresholds are Google&apos;s own
            published Good / Poor boundaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="info">
            <p className="font-semibold">These are lab measurements, not field data.</p>
            <p className="mt-0.5 text-sm text-secondary-foreground">
              Lighthouse loads the page once, on this machine, under simulated network and CPU conditions. Google&apos;s
              page-experience signals use <em>field</em> data — what real Chrome users actually experienced (the Chrome
              UX Report). This platform collects no field data, so none is shown here. Real-user numbers can differ
              substantially from these in either direction.
            </p>
          </Alert>

          {!hasAnyCompletedAudit ? (
            <EmptyState
              icon={FlaskConical}
              title="No completed audit"
              description="Core Web Vitals are only known once a Lighthouse audit has completed."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Desktop</TableHead>
                    <TableHead>Good</TableHead>
                    <TableHead>Poor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vitalRows.map((row) => {
                    const m = row.cell(mobile);
                    const d = row.cell(desktop);
                    return (
                      <TableRow key={row.key}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-2">
                            <MetricCell text={m.display.text} available={m.display.available} />
                            <StatusBadge status={m.status} />
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-2">
                            <MetricCell text={d.display.text} available={d.display.available} />
                            <StatusBadge status={d.status} />
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-secondary-foreground">
                          {row.goodThreshold}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-secondary-foreground">
                          {row.poorThreshold}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {inpUnmeasuredEverywhere && (
                <p className="text-xs text-muted">
                  <span className="font-semibold text-secondary-foreground">Why INP says &quot;Not measured&quot;:</span>{" "}
                  Interaction to Next Paint times how quickly the page responds to a real user interaction. A Lighthouse
                  lab run has no user and therefore no interactions to time, so it produces no value. That is a limit of
                  lab testing, not a result about this site — it is deliberately not shown as 0 and not shown as a
                  failure.
                </p>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Supporting lab metrics</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead numeric>Mobile</TableHead>
                      <TableHead numeric>Desktop</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supportingRows.map((row) => {
                      const m = row.read(mobile);
                      const d = row.read(desktop);
                      return (
                        <TableRow key={row.key}>
                          <TableCell>{row.label}</TableCell>
                          <TableCell numeric>
                            <MetricCell text={m.text} available={m.available} />
                          </TableCell>
                          <TableCell numeric>
                            <MetricCell text={d.text} available={d.available} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── 3. Lighthouse's own resource-level findings ───────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics from the latest run</CardTitle>
          <CardDescription>
            Resource-level findings read straight out of each completed audit&apos;s stored Lighthouse result — which
            element, script, stylesheet or font, with that run&apos;s own numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {diagnosticStrategies.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No completed audit"
              description="Diagnostics come from a completed Lighthouse run."
            />
          ) : (
            diagnosticStrategies.map(({ strategy, audit }) => (
              <section key={strategy}>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{STRATEGY_LABEL[strategy]}</h3>
                {audit.diagnostics.length === 0 ? (
                  <p className="text-sm text-muted">
                    Lighthouse recorded no resource-level diagnostic findings in this run.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {audit.diagnostics.map((diagnostic) => (
                      <li key={`${strategy}-${diagnostic.ruleKey}`} className="rounded-md border border-default p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <IssueSeverityBadge severity={diagnostic.severity} />
                          <span className="text-sm font-semibold text-foreground">{diagnostic.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-secondary-foreground">{diagnostic.evidence}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </CardContent>
      </Card>

      {/* ─── 4. Audit history ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Audit history</CardTitle>
          <CardDescription>
            Every recent Lighthouse batch for this site, newest first. Each batch runs mobile and desktop
            independently, so one can succeed while the other fails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pageSpeed || pageSpeed.batches.length === 0 ? (
            <EmptyState icon={GaugeIcon} title="No audits yet" description="No Lighthouse run has been started." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead numeric>Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageSpeed.batches.flatMap((batch) =>
                  batch.audits.map((audit) => (
                    <TableRow key={audit.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatUpdatedAt(batch.createdAt) ?? "Not recorded"}
                      </TableCell>
                      <TableCell className="capitalize">{audit.strategy}</TableCell>
                      <TableCell className="capitalize">{audit.status}</TableCell>
                      <TableCell numeric>
                        {audit.performanceScore === null ? (
                          <span className="font-medium text-muted">Not measured</span>
                        ) : (
                          audit.performanceScore
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── 5. Then, and only then, the crawl-attached PAGESPEED_ issues ─ */}
      <ModuleSeverityKpis
        countsBySeverity={data.countsBySeverity}
        totalIssueTypes={data.totalIssueTypes}
        totalAffectedPageInstances={data.totalAffectedPageInstances}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="Performance findings on crawled pages"
        description="The PageSpeed rules recorded against pages in the most recent completed crawl. These are a different thing from the Lighthouse scores above — see the note below."
        extraFooterItems={
          data.hasCompletedCrawl
            ? [{ label: "Pages scanned", value: data.report.pagesScanned.toLocaleString("en-US") }]
            : undefined
        }
      />

      <Alert variant="info">
        <p className="font-semibold">Why these counts can be zero while the scores above are not.</p>
        <p className="mt-0.5 text-sm text-secondary-foreground">
          A Lighthouse audit measures one URL. Its findings are additionally recorded as page-level issues only when
          that exact URL also exists as a crawled page in this site&apos;s most recent completed crawl. When the audited
          address and the crawled address differ even slightly — a trailing slash, <code>www</code>, http vs https —
          the audit still stands on its own above, but no issue rows are attached, so the count here is 0. A 0 here
          means &quot;nothing attached to a crawled page&quot;, never &quot;this site is fast&quot;.
        </p>
      </Alert>

      <ModuleTopicGrid
        topics={data.topics}
        issuesPath={issuesPath}
        hasCompletedCrawl={data.hasCompletedCrawl}
        title="By performance area"
        description="Every area with at least one recorded finding, linking into the pre-filtered issue list. An area with no findings is not listed — an absent area is not a measured zero."
      />

      <ModuleTopIssues
        issues={previewIssues}
        totalIssueTypes={data.totalIssueTypes}
        issuesPath={issuesPath}
        crawlHistoryHref={crawlHistoryHref}
        hasCompletedCrawl={data.hasCompletedCrawl}
        emptyTitle="No performance findings on crawled pages"
        emptyDescription="No PageSpeed rule is recorded against any page in the most recent completed crawl."
        emptyExtra={
          <p className="mx-auto max-w-lg text-center text-xs text-muted">
            <ListChecks className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
            This is not a statement that the site is fast — read the Lighthouse scores at the top of this page for
            that.
          </p>
        }
      />
    </div>
  );
}
