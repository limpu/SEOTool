import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { pages, pagespeedAudits, seoIssues } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getPgErrorCode } from "@/lib/db/pg-error";
import { normalizeCrawlUrl } from "@/lib/crawler/normalize-url";
import { ensureSeoRules } from "@/lib/seo-rules/ensure-rules";
import { ALL_RULES_BY_KEY } from "@/lib/seo-rules/rules";
import { evaluatePageSpeedSignals } from "./evaluate-thresholds";
import { evaluatePageSpeedDiagnostics, type DiagnosticAuditsMap } from "./diagnostics";
import { runLighthouseAudit, LighthouseRunError, type PageSpeedStrategy } from "./lighthouse-runner";

const STRATEGIES: PageSpeedStrategy[] = ["mobile", "desktop"];

/**
 * In-process serial queue for Lighthouse runs. This was added after a real
 * bug found during live verification: `lighthouse` instruments itself using
 * Node's global `performance` marks/measures, which are shared process-wide
 * — launching two `lighthouse()` calls concurrently in the same Node
 * process (e.g. the mobile + desktop runs of one batch, kicked off back to
 * back) causes one of them to fail with "The 'start lh:runner:gather'
 * performance mark has not been set" because the two runs stomp on each
 * other's marks. Each launched Chrome instance is otherwise independent
 * (separate port/profile), so this is specifically a `lighthouse` package
 * constraint, not a Chrome/chrome-launcher one. Chaining every audit onto
 * one promise queue (regardless of website/strategy) guarantees at most one
 * `lighthouse()` call is in flight at a time in this process — the same
 * "no separate worker/queue yet, single Next.js process" precedent Phase 6
 * already established for crawls, just also serialized against itself.
 */
let lighthouseQueue: Promise<void> = Promise.resolve();

function enqueueLighthouseRun<T>(fn: () => Promise<T>): Promise<T> {
  const run = lighthouseQueue.then(fn, fn);
  // Swallow errors here so one failed run doesn't wedge the queue for
  // everything queued after it — the caller of `run` still sees the
  // rejection via its own returned promise.
  lighthouseQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Starts a batch of PageSpeed audits (mobile + desktop) for one URL,
 * scoped to a website. Mirrors Phase 6's `POST /crawl` shape: insert
 * "pending" row(s) synchronously (so the client has something to poll
 * immediately), then run the actual work fire-and-forget. Lighthouse runs
 * are expensive (many seconds, a real browser) — this is deliberately NOT
 * run inline during the BFS crawl the way Phases 7-19's lightweight
 * HTML-parsing rules are; it's its own explicitly-triggered job, same
 * reasoning as why the crawl itself is a separate triggered action from
 * website creation.
 */
export async function startPageSpeedBatch(websiteId: string, url: string) {
  const batchId = randomUUID();

  // Insert (and kick off) each strategy independently rather than as one
  // all-or-nothing transaction: the one-active-per-(website,strategy)
  // unique index (mirroring crawl_runs' partial index from Phase 6) is
  // scoped per strategy, so "mobile already running" should not prevent a
  // desktop run from starting in the same batch — and starting the job
  // fire-and-forget immediately after each successful insert (rather than
  // after the whole loop) avoids a mobile row sitting at "pending" forever
  // if the desktop insert then throws.
  const inserted: (typeof pagespeedAudits.$inferSelect)[] = [];
  let anyConflict = false;

  for (const strategy of STRATEGIES) {
    try {
      const [row] = await db
        .insert(pagespeedAudits)
        .values({ batchId, websiteId, url, strategy, status: "pending" })
        .returning();
      inserted.push(row);
      void runOneAudit(row.id).catch((err) => {
        console.error(`PageSpeed audit ${row.id} failed unexpectedly:`, err);
      });
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
        anyConflict = true;
        continue;
      }
      throw err;
    }
  }

  if (inserted.length === 0 && anyConflict) {
    throw new PageSpeedAlreadyRunningError();
  }

  return { batchId, audits: inserted };
}

export class PageSpeedAlreadyRunningError extends Error {
  constructor() {
    super("A PageSpeed audit is already in progress for this website.");
  }
}

async function runOneAudit(auditId: string) {
  const [audit] = await db.select().from(pagespeedAudits).where(eq(pagespeedAudits.id, auditId)).limit(1);
  if (!audit) return;

  await db
    .update(pagespeedAudits)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(pagespeedAudits.id, auditId));

  try {
    const { metrics, trimmedResult } = await enqueueLighthouseRun(() =>
      runLighthouseAudit(audit.url, audit.strategy as PageSpeedStrategy)
    );

    await db
      .update(pagespeedAudits)
      .set({
        status: "completed",
        completedAt: new Date(),
        performanceScore: metrics.performanceScore,
        accessibilityScore: metrics.accessibilityScore,
        bestPracticesScore: metrics.bestPracticesScore,
        seoScore: metrics.seoScore,
        lcp: metrics.lcp,
        cls: metrics.cls,
        inp: metrics.inp,
        fcp: metrics.fcp,
        tbt: metrics.tbt,
        speedIndex: metrics.speedIndex,
        ttfb: metrics.ttfb,
        lighthouseVersion: metrics.lighthouseVersion,
        rawResult: trimmedResult,
      })
      .where(eq(pagespeedAudits.id, auditId));

    await attachIssuesIfPageKnown(
      audit.websiteId,
      audit.url,
      audit.strategy as PageSpeedStrategy,
      metrics,
      (trimmedResult as { audits?: DiagnosticAuditsMap }).audits ?? {}
    );
  } catch (err) {
    const message = err instanceof LighthouseRunError ? err.message : err instanceof Error ? err.message : String(err);
    await db
      .update(pagespeedAudits)
      .set({ status: "failed", completedAt: new Date(), error: message })
      .where(eq(pagespeedAudits.id, auditId));
  }
}

/**
 * Best-effort integration with the existing `seo_issues`/`seo_rules`
 * pattern (Phases 7-19): if the audited URL matches a page this website has
 * already crawled (most recent crawl run, exact URL match), attach the
 * Phase 20 CWV/performance-score issue signals to that page row, same as
 * every other rule category. If no matching crawled page exists yet (the
 * user ran PageSpeed without ever crawling, or against a URL the crawl
 * never visited), the audit's scores/metrics are still fully persisted in
 * `pagespeed_audits` and shown in the UI — they're just not additionally
 * mirrored into `seo_issues`, since that table requires a non-null
 * `page_id` foreign key and there is deliberately no separate PageSpeed
 * page table to attach to instead.
 */
/**
 * Resolves an audited URL to a crawled `pages` row.
 *
 * Exact string match is tried first (index-friendly, and correct whenever the
 * two strings already agree). It is NOT sufficient on its own: a real bug
 * found in Stage 3A verification is that PageSpeed audits the website's
 * stored `url` while the crawler stores the URL it actually fetched, and the
 * two routinely differ by a trailing slash — `https://example.com` (audit)
 * vs `https://example.com/` (crawl). Under the old exact-only match every
 * Phase 20/21 PageSpeed signal was silently dropped for any site whose URL
 * was entered without a trailing slash, while working fine for sites entered
 * with one. Nothing errored; the diagnostics just never appeared, which is
 * exactly the kind of silent-nothing this codebase treats as a real defect.
 *
 * The fallback reuses Phase 6's `normalizeCrawlUrl` (the same canonicalisation
 * the crawl queue already de-duplicates with) rather than hand-rolling a
 * second URL-equality notion. It is scoped to this website's pages and only
 * runs when the exact match misses, so the common path stays a single indexed
 * lookup.
 */
async function findMatchingPageId(websiteId: string, url: string): Promise<string | null> {
  const [exact] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.websiteId, websiteId), eq(pages.url, url)))
    .orderBy(desc(pages.createdAt))
    .limit(1);
  if (exact) return exact.id;

  const target = normalizeCrawlUrl(url);
  if (!target) return null;

  const candidates = await db
    .select({ id: pages.id, url: pages.url })
    .from(pages)
    .where(eq(pages.websiteId, websiteId))
    .orderBy(desc(pages.createdAt));

  return candidates.find((c) => normalizeCrawlUrl(c.url) === target)?.id ?? null;
}

async function attachIssuesIfPageKnown(
  websiteId: string,
  url: string,
  strategy: PageSpeedStrategy,
  metrics: Parameters<typeof evaluatePageSpeedSignals>[0],
  diagnosticAudits: DiagnosticAuditsMap
) {
  const pageId = await findMatchingPageId(websiteId, url);
  if (!pageId) return;

  // Phase 20's headline score/CWV-threshold signals, plus Phase 21's
  // resource-level diagnostic signals extracted from the same Lighthouse
  // run's audits — both flow through the identical seo_issues pipeline.
  const signals = [...evaluatePageSpeedSignals(metrics, strategy), ...evaluatePageSpeedDiagnostics(diagnosticAudits)];
  if (signals.length === 0) return;

  const ruleIdByKey = await ensureSeoRules();

  const rows = signals
    .map((signal) => {
      const ruleId = ruleIdByKey.get(signal.ruleKey);
      const definition = ALL_RULES_BY_KEY.get(signal.ruleKey);
      if (!ruleId || !definition) return null;
      return {
        pageId,
        ruleId,
        category: definition.category,
        severity: definition.severity,
        title: definition.title,
        description: definition.description,
        evidence: signal.evidence,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await db.insert(seoIssues).values(rows);
  }
}

export async function listPageSpeedBatches(websiteId: string, limit = 10) {
  const rows = await db
    .select()
    .from(pagespeedAudits)
    .where(eq(pagespeedAudits.websiteId, websiteId))
    .orderBy(desc(pagespeedAudits.createdAt))
    .limit(limit * STRATEGIES.length);

  const byBatch = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byBatch.get(row.batchId) ?? [];
    list.push(row);
    byBatch.set(row.batchId, list);
  }

  return Array.from(byBatch.entries())
    .map(([batchId, audits]) => ({
      batchId,
      createdAt: audits.reduce((max, a) => (a.createdAt > max ? a.createdAt : max), audits[0].createdAt),
      audits,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}
