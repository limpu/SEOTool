/**
 * Stage 2 / Stage 3A — ONE server-side data loader shared by all EIGHT
 * issue-based module reports (Technical SEO, On-Page SEO, Schema, Sitemap,
 * Robots.txt, PageSpeed, AI Search Intelligence, E-E-A-T / Trust) and by all
 * three of each module's routes (Overview / Issues / Issue detail).
 *
 * Stage 3A added three module-specific extras (`pageSpeed`, `aiSearch`,
 * `eeat`), each loaded ONLY for the module that renders it and each sourced
 * from a compute function that already existed (Phase 20's `pagespeed_audits`
 * rows, Phase 24's `computeWebsiteAiSearch`, Phase 25's `computeWebsiteEeat`).
 * No new analysis engine, no new table, nothing derived that the platform did
 * not already measure.
 *
 * `_module-report` is an underscore-prefixed PRIVATE folder, so Next's router
 * ignores it — this directory adds shared code to the route tree without
 * adding a route.
 *
 * Every number here comes from an ALREADY-EXISTING compute function or from a
 * read-only query over already-persisted crawl data. No `src/lib` business
 * logic, no API route and no DB schema was added or changed for Stage 2, and
 * nothing here invents, interpolates or substitutes a metric.
 *
 * Wrapped in React's `cache()` for the same reason Stage 1's Site Audit loader
 * is: the shared `layout.tsx` needs the header chips and the tab count, and
 * the page under it needs the issues, and between them that must be ONE fetch
 * per request — not one per card and not one per segment.
 *
 * The module-specific extras (`schemaStats`, `siteSignals`) are loaded ONLY
 * for the modules that render them, so Technical SEO never pays for a
 * structured-data aggregation it does not show.
 */

import { cache } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { pages, pagespeedAudits, schemas, seoIssues, seoRules } from "@/lib/db/schema";
import { listCrawlRuns } from "@/lib/crawler/queries";
import { computeWebsiteModuleReport, type ModuleKey, type ModuleReportResult } from "@/lib/module-reports/compute";
import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";
import { computeWebsiteAiSearch, type WebsiteAiSearchResult } from "@/lib/ai-search/compute";
import { computeWebsiteEeat, type WebsiteEeatResult } from "@/lib/eeat/compute";
import { evaluatePageSpeedDiagnostics, type DiagnosticAuditsMap } from "@/lib/pagespeed/diagnostics";
import { PAGESPEED_DIAGNOSTICS_RULES_BY_KEY } from "@/lib/seo-rules/pagespeed-diagnostics-rules-registry";
import type { ReportIssue } from "@/components/report/filtering";
import { aggregateDimensions, type AggregatedDimension } from "@/components/report/ai-dimensions";
import {
  MODULE_DEFINITIONS,
  OTHER_TOPIC_KEY,
  topicForRuleKey,
  topicLabel,
  type ModuleDefinition,
} from "@/components/report/module-definitions";

/**
 * One distinct rule violation for a module, aggregated across every page it
 * fires on. `category` carries the module's TOPIC key (see
 * `module-definitions.ts`), which is what the shared facet/filter code
 * operates on.
 */
export interface ModuleIssue extends ReportIssue {
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPages: { pageId: string; url: string; evidence: string | null }[];
}

export interface ModuleTopicSummary {
  key: string;
  label: string;
  /** Distinct rules in this topic. */
  issueCount: number;
  /** Sum of each rule's distinct affected pages. */
  affectedPageCount: number;
  countsBySeverity: Record<Severity, number>;
}

/** One crawled page, with how many of THIS module's rules fired on it. */
export interface AffectedPageRollup {
  pageId: string;
  url: string;
  ruleCount: number;
  /** Worst severity among the rules firing on this page. */
  worstSeverity: Severity;
}

/**
 * A site-level finding that lives OUTSIDE the module whose page needs it.
 *
 * "Is there a robots.txt?" and "is there a sitemap?" are recorded as
 * `TECH_ROBOTS_TXT_MISSING` / `TECH_SITEMAP_MISSING` — `TECH_`-prefixed, so
 * `computeWebsiteModuleReport("robots"|"sitemap")` cannot see them. The AI
 * crawler verdicts (`AI_CRAWLER_*`) are likewise derived from robots.txt but
 * carry their own prefix and belong to the AI Search module. Rather than
 * change the prefix routing (a backend change, and one that would move those
 * rules out of Technical SEO where they also belong), this reads exactly those
 * keys back in one small indexed query.
 */
export interface SiteSignal {
  fired: boolean;
  /** Number of `seo_issues` rows for this rule in the latest completed run. */
  count: number;
  /** The crawler's own evidence strings, verbatim. Never rewritten. */
  evidence: string[];
}

export type SiteSignalKey =
  | "TECH_ROBOTS_TXT_MISSING"
  | "TECH_SITEMAP_MISSING"
  | "TECH_BLOCKED_BY_ROBOTS_TXT"
  | "AI_CRAWLER_BLOCKED"
  | "AI_CRAWLER_PARTIALLY_BLOCKED";

const SITE_SIGNAL_KEYS: SiteSignalKey[] = [
  "TECH_ROBOTS_TXT_MISSING",
  "TECH_SITEMAP_MISSING",
  "TECH_BLOCKED_BY_ROBOTS_TXT",
  "AI_CRAWLER_BLOCKED",
  "AI_CRAWLER_PARTIALLY_BLOCKED",
];

export type SiteSignals = Record<SiteSignalKey, SiteSignal>;

export interface SchemaTypeStat {
  /** `schemas.schema_type`, or `null` when the block declared no `@type`. */
  type: string | null;
  blocks: number;
  pageCount: number;
  validBlocks: number;
  invalidBlocks: number;
}

export interface SchemaStats {
  totalBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
  /** Distinct crawled pages carrying at least one JSON-LD block. */
  pagesWithSchema: number;
  types: SchemaTypeStat[];
}

// ─── Stage 3A: PageSpeed (Lighthouse lab data) ─────────────────────────────
//
// The PageSpeed Overview's LEAD data does not come from the crawl at all — it
// comes from `pagespeed_audits`, which Phase 20 writes when a Lighthouse run
// is explicitly triggered. That table is entirely independent of crawl runs,
// so this loader deliberately does NOT scope to `report.crawlRunId`: an audit
// is a measurement of one URL at one moment, not of a crawl.

export type PageSpeedStrategy = "mobile" | "desktop";

/** One Lighthouse run, reshaped for display. Every field is verbatim from the DB. */
export interface PageSpeedAuditView {
  id: string;
  strategy: PageSpeedStrategy;
  status: string;
  url: string;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcp: number | null;
  cls: number | null;
  /**
   * Lighthouse's LAB-mode INP. `null` is an expected, valid result — lab mode
   * has no real user interactions to measure — and is passed through as
   * `null`, never coerced to 0. See `extract-metrics.ts`'s own note.
   */
  inp: number | null;
  fcp: number | null;
  tbt: number | null;
  speedIndex: number | null;
  ttfb: number | null;
  lighthouseVersion: string | null;
  /**
   * Resource-level findings, recomputed from this run's own persisted
   * `rawResult` with the SAME pure function the server uses when attaching
   * `seo_issues` — one evidence implementation, not two.
   */
  diagnostics: { ruleKey: string; title: string; severity: Severity; evidence: string }[];
}

export interface PageSpeedBatchView {
  batchId: string;
  createdAt: Date;
  audits: { id: string; strategy: PageSpeedStrategy; status: string; performanceScore: number | null }[];
}

export interface PageSpeedData {
  /** False when no Lighthouse audit has EVER been started for this site. */
  everRan: boolean;
  /** True while a run is pending/running — the Overview says so instead of showing a stale score as current. */
  activeRun: boolean;
  /** Most recent COMPLETED audit per strategy. `null` means that strategy has no completed run. */
  latest: Record<PageSpeedStrategy, PageSpeedAuditView | null>;
  batches: PageSpeedBatchView[];
}

const PAGESPEED_STRATEGIES: PageSpeedStrategy[] = ["mobile", "desktop"];
const ACTIVE_AUDIT_STATUSES = new Set(["pending", "running"]);

function toAuditView(row: typeof pagespeedAudits.$inferSelect): PageSpeedAuditView {
  const raw = row.rawResult as { audits?: DiagnosticAuditsMap } | null | undefined;
  let diagnostics: PageSpeedAuditView["diagnostics"] = [];
  if (raw?.audits) {
    try {
      diagnostics = evaluatePageSpeedDiagnostics(raw.audits).map((signal) => {
        const rule = PAGESPEED_DIAGNOSTICS_RULES_BY_KEY.get(signal.ruleKey);
        return {
          ruleKey: signal.ruleKey,
          title: rule?.title ?? signal.ruleKey,
          severity: (rule?.severity ?? "info") as Severity,
          evidence: signal.evidence,
        };
      });
    } catch {
      // A malformed persisted result yields NO diagnostics rather than
      // invented ones. The card says "none recorded", which is honest.
      diagnostics = [];
    }
  }

  return {
    id: row.id,
    strategy: row.strategy as PageSpeedStrategy,
    status: row.status,
    url: row.url,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    performanceScore: row.performanceScore,
    accessibilityScore: row.accessibilityScore,
    bestPracticesScore: row.bestPracticesScore,
    seoScore: row.seoScore,
    lcp: row.lcp,
    cls: row.cls,
    inp: row.inp,
    fcp: row.fcp,
    tbt: row.tbt,
    speedIndex: row.speedIndex,
    ttfb: row.ttfb,
    lighthouseVersion: row.lighthouseVersion,
    diagnostics,
  };
}

/** Recent Lighthouse audits for a website, newest first, grouped into batches. */
async function loadPageSpeedData(websiteId: string): Promise<PageSpeedData> {
  const rows = await db
    .select()
    .from(pagespeedAudits)
    .where(eq(pagespeedAudits.websiteId, websiteId))
    .orderBy(desc(pagespeedAudits.createdAt))
    .limit(20);

  const latest: Record<PageSpeedStrategy, PageSpeedAuditView | null> = { mobile: null, desktop: null };
  for (const strategy of PAGESPEED_STRATEGIES) {
    const row = rows.find((r) => r.strategy === strategy && r.status === "completed");
    latest[strategy] = row ? toAuditView(row) : null;
  }

  const byBatch = new Map<string, PageSpeedBatchView>();
  for (const row of rows) {
    let batch = byBatch.get(row.batchId);
    if (!batch) {
      batch = { batchId: row.batchId, createdAt: row.createdAt, audits: [] };
      byBatch.set(row.batchId, batch);
    }
    if (row.createdAt > batch.createdAt) batch.createdAt = row.createdAt;
    batch.audits.push({
      id: row.id,
      strategy: row.strategy as PageSpeedStrategy,
      status: row.status,
      performanceScore: row.performanceScore,
    });
  }

  return {
    everRan: rows.length > 0,
    activeRun: rows.some((row) => ACTIVE_AUDIT_STATUSES.has(row.status)),
    latest,
    batches: Array.from(byBatch.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5),
  };
}

// ─── Stage 3A: AI Search readiness ─────────────────────────────────────────

export interface AiSearchData extends WebsiteAiSearchResult {
  /** Site-level rollups of Phase 24's per-page dimensions. Unassessed stays unassessed. */
  geoDimensions: AggregatedDimension[];
  aeoDimensions: AggregatedDimension[];
  aioDimensions: AggregatedDimension[];
}

async function loadAiSearchData(websiteId: string): Promise<AiSearchData> {
  const readiness = await computeWebsiteAiSearch(websiteId);
  return {
    ...readiness,
    geoDimensions: aggregateDimensions(readiness.pages.map((page) => page.geo.dimensions)),
    aeoDimensions: aggregateDimensions(readiness.pages.map((page) => page.aeo.dimensions)),
    aioDimensions: aggregateDimensions(readiness.pages.map((page) => page.aio.dimensions)),
  };
}

export interface ModuleReportData {
  definition: ModuleDefinition;
  report: ModuleReportResult;

  hasCompletedCrawl: boolean;
  lastCrawl: {
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    pagesCrawled: number | null;
    pagesDiscovered: number | null;
  } | null;

  issues: ModuleIssue[];
  totalIssueTypes: number;
  /** Sum of each rule's distinct affected pages — issue INSTANCES, not rules. */
  totalAffectedPageInstances: number;
  /** Distinct rules per severity (NOT `report.countsBySeverity`, which counts raw rows). */
  countsBySeverity: Record<Severity, number>;

  topics: ModuleTopicSummary[];
  mostAffectedPages: AffectedPageRollup[];

  /** Only loaded for the Schema module; `null` everywhere else. */
  schemaStats: SchemaStats | null;
  /** Only loaded for the Sitemap and Robots.txt modules; `null` everywhere else. */
  siteSignals: SiteSignals | null;

  /** Stage 3A. Only loaded for the PageSpeed module; `null` everywhere else. */
  pageSpeed: PageSpeedData | null;
  /** Stage 3A. Only loaded for AI Search Intelligence; `null` everywhere else. */
  aiSearch: AiSearchData | null;
  /** Stage 3A. Only loaded for E-E-A-T / Trust; `null` everywhere else. */
  eeat: WebsiteEeatResult | null;
}

function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function emptySiteSignals(): SiteSignals {
  const out = {} as SiteSignals;
  for (const key of SITE_SIGNAL_KEYS) out[key] = { fired: false, count: 0, evidence: [] };
  return out;
}

/** Reads the five out-of-module site-level rule keys for one crawl run. */
async function loadSiteSignals(crawlRunId: string): Promise<SiteSignals> {
  const rows = await db
    .select({ ruleKey: seoRules.ruleKey, evidence: seoIssues.evidence })
    .from(seoIssues)
    .innerJoin(seoRules, eq(seoIssues.ruleId, seoRules.id))
    .innerJoin(pages, eq(seoIssues.pageId, pages.id))
    .where(and(eq(pages.crawlRunId, crawlRunId), inArray(seoRules.ruleKey, SITE_SIGNAL_KEYS)));

  const signals = emptySiteSignals();
  for (const row of rows) {
    const signal = signals[row.ruleKey as SiteSignalKey];
    if (!signal) continue;
    signal.fired = true;
    signal.count += 1;
    if (row.evidence && !signal.evidence.includes(row.evidence)) signal.evidence.push(row.evidence);
  }
  return signals;
}

/**
 * Structured-data inventory for one crawl run, straight from the Phase 11
 * `schemas` table.
 *
 * This is the only place in Stage 2 that reads a table the module reports do
 * not already read, and it exists for one honesty reason: "0 schema issues"
 * is ambiguous on its own. A site with no JSON-LD at all produces exactly the
 * same zero as a site whose markup is flawless, and calling both a clean pass
 * would be a fabricated verdict. `schemas` rows are written only when a block
 * is actually found, so their presence or absence tells the two apart.
 */
/**
 * Map key for JSON-LD blocks whose `schema_type` is NULL. A leading space
 * cannot collide with any real `@type` (schema.org types never start with
 * one), so untyped blocks get their own honest bucket instead of being
 * merged into a named type or dropped.
 */
const UNTYPED_SCHEMA_BUCKET = " untyped";

async function loadSchemaStats(crawlRunId: string): Promise<SchemaStats> {
  const rows = await db
    .select({ pageId: schemas.pageId, schemaType: schemas.schemaType, isValid: schemas.isValid })
    .from(schemas)
    .innerJoin(pages, eq(schemas.pageId, pages.id))
    .where(eq(pages.crawlRunId, crawlRunId));

  const byType = new Map<string, { type: string | null; blocks: number; pages: Set<string>; valid: number; invalid: number }>();
  const pagesWithSchema = new Set<string>();
  let validBlocks = 0;

  for (const row of rows) {
    pagesWithSchema.add(row.pageId);
    // `schema_type` is nullable; `null` is its own bucket, not merged into a
    // named type and not dropped — a block with no `@type` is a real finding.
    const bucketKey = row.schemaType ?? UNTYPED_SCHEMA_BUCKET;
    let bucket = byType.get(bucketKey);
    if (!bucket) {
      bucket = { type: row.schemaType, blocks: 0, pages: new Set<string>(), valid: 0, invalid: 0 };
      byType.set(bucketKey, bucket);
    }
    bucket.blocks += 1;
    bucket.pages.add(row.pageId);
    if (row.isValid) {
      bucket.valid += 1;
      validBlocks += 1;
    } else {
      bucket.invalid += 1;
    }
  }

  const types: SchemaTypeStat[] = Array.from(byType.values())
    .map((bucket) => ({
      type: bucket.type,
      blocks: bucket.blocks,
      pageCount: bucket.pages.size,
      validBlocks: bucket.valid,
      invalidBlocks: bucket.invalid,
    }))
    .sort((a, b) => b.pageCount - a.pageCount || b.blocks - a.blocks || (a.type ?? "").localeCompare(b.type ?? ""));

  return {
    totalBlocks: rows.length,
    validBlocks,
    invalidBlocks: rows.length - validBlocks,
    pagesWithSchema: pagesWithSchema.size,
    types,
  };
}

export const loadModuleReport = cache(
  async (websiteId: string, moduleKey: ModuleKey): Promise<ModuleReportData> => {
    const definition = MODULE_DEFINITIONS[moduleKey];

    const [report, runs] = await Promise.all([
      computeWebsiteModuleReport(websiteId, moduleKey),
      listCrawlRuns(websiteId),
    ]);

    // `report.rules` is already ordered severity-then-breadth by
    // `computeCrawlRunModuleReport`; reshaping preserves that order.
    const issues: ModuleIssue[] = report.rules.map((rule) => ({
      ruleKey: rule.ruleKey,
      title: rule.title,
      severity: rule.severity,
      category: topicForRuleKey(moduleKey, rule.ruleKey),
      affectedPageCount: rule.affectedPageCount,
      description: rule.description,
      recommendation: rule.recommendation,
      fixExample: rule.fixExample,
      impact: rule.impact,
      affectedPages: rule.affectedPages,
    }));

    const countsBySeverity = emptySeverityCounts();
    for (const issue of issues) countsBySeverity[issue.severity] += 1;

    // ─── Topic summaries ─────────────────────────────────────────────────
    // Only topics that actually have a finding are emitted. An absent topic
    // is NOT a measured zero, and a "Redirects 0" card on a site that was
    // never redirect-tested would read as a clean bill of health.
    const topicMap = new Map<string, ModuleTopicSummary>();
    for (const issue of issues) {
      let entry = topicMap.get(issue.category);
      if (!entry) {
        entry = {
          key: issue.category,
          label: topicLabel(moduleKey, issue.category),
          issueCount: 0,
          affectedPageCount: 0,
          countsBySeverity: emptySeverityCounts(),
        };
        topicMap.set(issue.category, entry);
      }
      entry.issueCount += 1;
      entry.affectedPageCount += issue.affectedPageCount;
      entry.countsBySeverity[issue.severity] += 1;
    }

    // Declared order, so the grid reads the same way every time and does not
    // reshuffle between crawls. "Other findings" always sorts last.
    const declaredOrder = definition.topics.map((topic) => topic.key);
    const topics = Array.from(topicMap.values()).sort((a, b) => {
      const aIndex = a.key === OTHER_TOPIC_KEY ? Number.MAX_SAFE_INTEGER : declaredOrder.indexOf(a.key);
      const bIndex = b.key === OTHER_TOPIC_KEY ? Number.MAX_SAFE_INTEGER : declaredOrder.indexOf(b.key);
      return aIndex - bIndex;
    });

    // ─── Most-affected pages ─────────────────────────────────────────────
    // Rolled up in memory from data already fetched above — no second query.
    const pageMap = new Map<string, { pageId: string; url: string; ruleCount: number; worst: number }>();
    for (const issue of issues) {
      const severityRank = SEVERITY_ORDER.indexOf(issue.severity);
      for (const page of issue.affectedPages) {
        const entry = pageMap.get(page.pageId);
        if (entry) {
          entry.ruleCount += 1;
          if (severityRank < entry.worst) entry.worst = severityRank;
        } else {
          pageMap.set(page.pageId, { pageId: page.pageId, url: page.url, ruleCount: 1, worst: severityRank });
        }
      }
    }
    const mostAffectedPages: AffectedPageRollup[] = Array.from(pageMap.values())
      .sort((a, b) => b.ruleCount - a.ruleCount || a.worst - b.worst || a.url.localeCompare(b.url))
      .map((entry) => ({
        pageId: entry.pageId,
        url: entry.url,
        ruleCount: entry.ruleCount,
        worstSeverity: SEVERITY_ORDER[entry.worst],
      }));

    // ─── Module-specific extras ──────────────────────────────────────────
    const needsSchemaStats = moduleKey === "schema";
    const needsSiteSignals = moduleKey === "sitemap" || moduleKey === "robots";

    const [schemaStats, siteSignals, pageSpeed, aiSearch, eeat] = await Promise.all([
      needsSchemaStats && report.crawlRunId ? loadSchemaStats(report.crawlRunId) : Promise.resolve(null),
      needsSiteSignals && report.crawlRunId ? loadSiteSignals(report.crawlRunId) : Promise.resolve(null),
      // NOT gated on a completed crawl: a Lighthouse audit is independent of
      // crawling, and a site with audits but no crawl must still see them.
      moduleKey === "pagespeed" ? loadPageSpeedData(websiteId) : Promise.resolve(null),
      moduleKey === "ai_search" ? loadAiSearchData(websiteId) : Promise.resolve(null),
      moduleKey === "eeat" ? computeWebsiteEeat(websiteId) : Promise.resolve(null),
    ]);

    const lastRun = runs[0];

    return {
      definition,
      report,
      hasCompletedCrawl: report.crawlRunId !== null,
      lastCrawl: lastRun
        ? {
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            completedAt: lastRun.completedAt,
            pagesCrawled: lastRun.pagesCrawled,
            pagesDiscovered: lastRun.pagesDiscovered,
          }
        : null,
      issues,
      totalIssueTypes: issues.length,
      totalAffectedPageInstances: issues.reduce((sum, issue) => sum + issue.affectedPageCount, 0),
      countsBySeverity,
      topics,
      mostAffectedPages,
      schemaStats,
      siteSignals,
      pageSpeed,
      aiSearch,
      eeat,
    };
  }
);
