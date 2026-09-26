/**
 * Phase 35 addendum — dedicated per-module report data for the 5 sidebar
 * items that were left "Coming Soon" in the workspace refactor (Technical
 * SEO, On-Page SEO, Schema, Sitemap, Robots.txt). These are NOT new
 * analysis engines — Phases 7/8/11/12/13 already write real findings into
 * `seo_issues` for every one of these; this module only aggregates that
 * already-persisted data for a dedicated report page, live-computed (not
 * cached), following the exact same "most recent completed crawl run"
 * pattern Phase 22's `computeWebsiteScores` and Phase 23's
 * `computeWebsiteRecommendations` already established (reused here, not
 * reimplemented).
 *
 * Rule-key prefix, not `seo_rules.category`, is the filter axis. Schema,
 * Sitemap, and Robots.txt issues are all persisted with `category` values
 * that collapse into just `technical` / `schema` for Phase 22's SCORING
 * purposes (Sitemap + Robots.txt rules are both stored under the generic
 * `technical` category — see technical-rules-registry.ts /
 * sitemap-rules-registry.ts / robots-rules-registry.ts) but every rule's
 * `ruleKey` carries its own distinct, stable prefix (`TECH_`, `ONPAGE_`,
 * `SCHEMA_`, `SITEMAP_`, `ROBOTS_`) that cleanly separates the five without
 * inventing a new DB enum value. "Technical SEO" excludes the SITEMAP_ and
 * ROBOTS_ prefixed rules so those get their own dedicated pages rather than
 * being duplicated across three reports.
 */

import { db } from "@/lib/db";
import { pages, seoIssues, seoRules, crawlRuns } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { SEVERITY_ORDER, type Severity } from "@/lib/scoring/formula";

export type ModuleKey =
  | "technical"
  | "on_page"
  | "schema"
  | "sitemap"
  | "robots"
  // Stage 3A — three more issue-backed modules. Purely additive: the five
  // above resolve exactly as they did before, byte for byte.
  | "pagespeed"
  | "ai_search"
  | "eeat";

export interface ModuleRuleGroup {
  ruleKey: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPageCount: number;
  affectedPages: { pageId: string; url: string; evidence: string | null }[];
}

export interface ModuleReportResult {
  crawlRunId: string | null;
  pagesScanned: number;
  totalIssues: number;
  countsBySeverity: Record<Severity, number>;
  rules: ModuleRuleGroup[];
}

function emptyResult(): ModuleReportResult {
  return {
    crawlRunId: null,
    pagesScanned: 0,
    totalIssues: 0,
    countsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    rules: [],
  };
}

/** Exported for pure unit testing — the rule-key-prefix routing table is the load-bearing logic in this module. */
export function matchesModule(ruleKey: string, moduleKey: ModuleKey): boolean {
  switch (moduleKey) {
    case "technical":
      return ruleKey.startsWith("TECH_") && !ruleKey.startsWith("SITEMAP_") && !ruleKey.startsWith("ROBOTS_");
    case "on_page":
      return ruleKey.startsWith("ONPAGE_");
    case "schema":
      return ruleKey.startsWith("SCHEMA_");
    case "sitemap":
      return ruleKey.startsWith("SITEMAP_");
    case "robots":
      return ruleKey.startsWith("ROBOTS_");
    // ─── Stage 3A ────────────────────────────────────────────────────────
    case "pagespeed":
      // Both PAGESPEED registries (Phase 20's headline score/CWV signals and
      // Phase 21's resource-level diagnostics) share this one prefix.
      return ruleKey.startsWith("PAGESPEED_");
    case "ai_search":
      // The only module that owns MORE THAN ONE prefix. AEO_/GEO_ are Phase
      // 24's readiness-opportunity rules, LLMS_ is Phase 18's llms.txt
      // analysis and AI_ is Phase 19's AI-crawler verdicts. They carry
      // different prefixes because they were built by different phases, but
      // they are one subject to a user: can generative engines read,
      // understand and cite this site. Listing all four here is what "one
      // module, several prefixes" means — no rule key was re-prefixed, and
      // the AI_CRAWLER_* verdicts stay equally visible to Robots.txt's
      // Overview, which reads them as cross-module site signals.
      return (
        ruleKey.startsWith("AEO_") ||
        ruleKey.startsWith("GEO_") ||
        ruleKey.startsWith("AI_") ||
        ruleKey.startsWith("LLMS_")
      );
    case "eeat":
      return ruleKey.startsWith("EEAT_");
  }
}

/** Module-filtered report for a single crawl run's pages. */
export async function computeCrawlRunModuleReport(crawlRunId: string, moduleKey: ModuleKey): Promise<ModuleReportResult> {
  const pageRows = await db.select({ id: pages.id }).from(pages).where(eq(pages.crawlRunId, crawlRunId));
  const pageIds = pageRows.map((p) => p.id);

  if (pageIds.length === 0) {
    return { ...emptyResult(), crawlRunId, pagesScanned: 0 };
  }

  const rows = await db
    .select({
      ruleKey: seoRules.ruleKey,
      severity: seoRules.severity,
      title: seoRules.title,
      description: seoRules.description,
      recommendation: seoRules.recommendation,
      fixExample: seoRules.fixExample,
      impact: seoRules.impact,
      pageId: seoIssues.pageId,
      pageUrl: pages.url,
      evidence: seoIssues.evidence,
    })
    .from(seoIssues)
    .innerJoin(seoRules, eq(seoIssues.ruleId, seoRules.id))
    .innerJoin(pages, eq(seoIssues.pageId, pages.id))
    .where(inArray(seoIssues.pageId, pageIds));

  const filtered = rows.filter((r) => matchesModule(r.ruleKey, moduleKey));

  const groups = new Map<string, ModuleRuleGroup>();
  const countsBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const row of filtered) {
    countsBySeverity[row.severity] += 1;
    let group = groups.get(row.ruleKey);
    if (!group) {
      group = {
        ruleKey: row.ruleKey,
        severity: row.severity,
        title: row.title,
        description: row.description,
        recommendation: row.recommendation,
        fixExample: row.fixExample,
        impact: row.impact,
        affectedPageCount: 0,
        affectedPages: [],
      };
      groups.set(row.ruleKey, group);
    }
    if (!group.affectedPages.some((p) => p.pageId === row.pageId)) {
      group.affectedPages.push({ pageId: row.pageId, url: row.pageUrl, evidence: row.evidence });
    }
  }

  for (const group of groups.values()) {
    group.affectedPageCount = group.affectedPages.length;
  }

  const rules = Array.from(groups.values()).sort((a, b) => {
    const sevDiff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (sevDiff !== 0) return sevDiff;
    if (b.affectedPageCount !== a.affectedPageCount) return b.affectedPageCount - a.affectedPageCount;
    return a.ruleKey.localeCompare(b.ruleKey);
  });

  return {
    crawlRunId,
    pagesScanned: pageIds.length,
    totalIssues: filtered.length,
    countsBySeverity,
    rules,
  };
}

/**
 * Website-level module report: the website's MOST RECENT completed crawl
 * run only — same "don't double-count across repeat crawls" reasoning
 * Phase 22/23 already document (old crawl runs' `pages` rows are never
 * deleted, so summing across all of them would double-count).
 */
export async function computeWebsiteModuleReport(websiteId: string, moduleKey: ModuleKey): Promise<ModuleReportResult> {
  const [latestRun] = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.websiteId, websiteId), eq(crawlRuns.status, "completed")))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    return emptyResult();
  }

  return computeCrawlRunModuleReport(latestRun.id, moduleKey);
}
