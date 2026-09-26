import { db } from "@/lib/db";
import { crawlRuns, images, links, llmsFiles, pages, robotsFiles, schemas, seoIssues, sitemapDocuments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import * as cheerio from "cheerio";
import { safeFetch, CrawlFetchError } from "./safe-fetch";
import { normalizeCrawlUrl, isSameHost } from "./normalize-url";
import { fetchRobotsDocument, isPathAllowed } from "./robots";
import { analyzeSitemaps } from "./sitemap-analysis";
import { analyzeLlmsFiles } from "./llms-analysis";
import { capForStorage } from "@/lib/site-files/fetch";
import {
  extractContentStructure,
  extractEeatSignals,
  extractHeadings,
  extractHreflang,
  extractImages,
  extractLinks,
  extractOpenGraph,
  extractPageData,
  extractStructuredData,
  extractTwitterCard,
} from "./extract";
import { ensureSeoRules } from "@/lib/seo-rules/ensure-rules";
import { ALL_RULES_BY_KEY } from "@/lib/seo-rules/rules";
import { evaluateDuplicateIssues, evaluatePageIssues } from "@/lib/seo-rules/on-page";
import {
  evaluateBlockedInternalLinks,
  evaluateDuplicateUrlVariants,
  evaluateOrphanPages,
  evaluateSiteLevelIssues,
  evaluateTechnicalPageIssues,
} from "@/lib/seo-rules/technical";
import { evaluateLinkIssues, type LinkStatus } from "@/lib/seo-rules/links";
import { evaluateImageFileSizeIssues, evaluateImageIssues } from "@/lib/seo-rules/images";
import { evaluateOrganizationConsistency, evaluateSchemaIssues } from "@/lib/seo-rules/schema";
import { evaluateSitemapDocumentIssues, evaluateSitemapUrlCrossReference } from "@/lib/seo-rules/sitemap";
import { evaluateRobotsIssues } from "@/lib/seo-rules/robots";
import { evaluateLlmsIssues } from "@/lib/seo-rules/llms";
import { evaluateAiCrawlerIssues } from "@/lib/seo-rules/ai-crawlers";
import { evaluateAiSearchPageIssues, evaluateAiSearchSiteIssues } from "@/lib/seo-rules/ai-search";
import { evaluateEeatPageIssues, evaluateEeatSiteIssues } from "@/lib/seo-rules/eeat";

interface CrawlTarget {
  id: string;
  url: string;
  maxPages: number;
  maxDepth: number;
}

const CONCURRENCY = 2;
const REQUEST_DELAY_MS = 300;

/**
 * How often (in pages) the running crawl writes its progress back to the
 * `crawl_runs` row so the polling UI can show real movement. Small enough
 * that a crawl visibly advances within a poll interval or two, large enough
 * that it does not add a database round-trip to every single page.
 */
const PROGRESS_UPDATE_EVERY = 5;
const QUEUE_CAP_MULTIPLIER = 5;
const MAX_LIVE_LINK_CHECKS = 20;
const LINK_CHECK_DELAY_MS = 150;
const MAX_IMAGE_SIZE_CHECKS = 20;

interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Runs a full crawl for a website and persists results (crawl_runs, pages,
 * links, images). Meant to be invoked fire-and-forget from an API route —
 * there's no separate job queue/worker process yet (per the master doc,
 * database-backed jobs come first; Redis/BullMQ is a later addition).
 */
export async function runCrawl(crawlRunId: string, target: CrawlTarget): Promise<void> {
  const errors: string[] = [];

  try {
    await db
      .update(crawlRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(crawlRuns.id, crawlRunId));

    const origin = new URL(target.url).origin;
    const siteHostname = new URL(target.url).hostname;

    const robotsDocument = await fetchRobotsDocument(origin);
    const robotsRules = robotsDocument.rules;
    const ruleIdByKey = await ensureSeoRules();

    const startUrl = normalizeCrawlUrl(target.url);
    if (!startUrl) {
      throw new Error(`Website URL could not be normalized: ${target.url}`);
    }

    const visited = new Set<string>();
    const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
    visited.add(startUrl);

    // Sitemap discovery + deep analysis (Phase 12) happen together in one
    // pass: the same fetch seeds the crawl queue and produces the
    // document-level data (HTTP status, XML validity, URL lists) that
    // sitemap issue evaluation needs later in this function.
    let sitemapAnalysis: Awaited<ReturnType<typeof analyzeSitemaps>> = { documents: [], stored: [], allUrls: [], found: false };
    try {
      sitemapAnalysis = await analyzeSitemaps(origin, robotsRules.sitemaps);
    } catch {
      // Sitemap discovery is best-effort; a failure here shouldn't block crawling.
    }
    // llms.txt / llms-full.txt (Phase 18) — fetched once per crawl, same
    // "site-level well-known file" pattern as robots.txt/sitemap.xml above.
    // Best-effort: a failure here shouldn't block crawling.
    let llmsAnalysis: Awaited<ReturnType<typeof analyzeLlmsFiles>> | null = null;
    try {
      llmsAnalysis = await analyzeLlmsFiles(origin);
    } catch {
      // best-effort, same as sitemap discovery above
    }

    // ─── Phase 37: persist the site-level files this crawl just fetched ────
    //
    // Before this, `analyzeSitemaps()` and the robots.txt fetch handed their
    // results to the rule engine and then DISCARDED both the documents and
    // their bodies, so the Sitemap and Robots.txt reports could never show the
    // file itself, its URL count, or whether it was an index. These writes
    // change nothing about the crawl or the rules — they only KEEP what was
    // already fetched, exactly as Phase 18 already did for llms.txt.
    //
    // Best-effort and non-fatal: a storage failure must not fail a crawl that
    // otherwise succeeded.
    try {
      for (const doc of sitemapAnalysis.stored) {
        const capped = doc.rawContent === null ? null : capForStorage(doc.rawContent);
        await db.insert(sitemapDocuments).values({
          websiteId: target.id,
          crawlRunId,
          url: doc.url,
          kind: "xml",
          source: "discovered",
          found: doc.httpStatus !== null && doc.httpStatus >= 200 && doc.httpStatus < 300,
          httpStatus: doc.httpStatus,
          rawContent: capped?.content ?? null,
          sizeBytes: capped?.sizeBytes ?? null,
          urlCount: doc.urlCount,
          isIndex: doc.isIndex,
          truncated: doc.overSizeCap || (capped?.truncated ?? false),
          fetchError: doc.fetchError,
        });
      }
    } catch (err) {
      errors.push(`Storing sitemap documents failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const robotsCapped = robotsDocument.rawContent === null ? null : capForStorage(robotsDocument.rawContent);
      await db.insert(robotsFiles).values({
        websiteId: target.id,
        crawlRunId,
        url: robotsDocument.url,
        source: "discovered",
        found: robotsDocument.rules.found,
        httpStatus: robotsDocument.httpStatus,
        rawContent: robotsCapped?.content ?? null,
        sizeBytes: robotsCapped?.sizeBytes ?? null,
        truncated: robotsDocument.overSizeCap || (robotsCapped?.truncated ?? false),
        fetchError: robotsDocument.fetchError,
      });
    } catch (err) {
      errors.push(`Storing robots.txt failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const raw of sitemapAnalysis.allUrls) {
      const normalized = normalizeCrawlUrl(raw);
      if (!normalized || visited.has(normalized)) continue;
      if (!isSameHost(normalized, siteHostname)) continue;
      visited.add(normalized);
      queue.push({ url: normalized, depth: 1 });
    }

    let pagesCrawled = 0;
    let cursor = 0;
    let homepagePageId: string | null = null;
    let siteHasEntitySchema = false;
    let imageSizeChecksRemaining = MAX_IMAGE_SIZE_CHECKS;
    const imageSizeCache = new Map<string, number>();
    const queueCap = target.maxPages * QUEUE_CAP_MULTIPLIER;

    async function worker() {
      while (pagesCrawled < target.maxPages && cursor < queue.length) {
        const item = queue[cursor++];
        if (!item) break;
        if (item.depth > target.maxDepth) continue;

        pagesCrawled++;
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        await crawlOnePage(item);

        // Publish progress DURING the crawl, not only at the end.
        //
        // `pagesCrawled` is a local counter; before this, it reached the
        // `crawl_runs` row only in the final "completed" update. The polling
        // UI reads that column, so for the whole duration of a real crawl it
        // truthfully rendered "Crawling — 0 pages processed so far" — a
        // healthy 75-page crawl was indistinguishable from a hung one, which
        // is exactly the case a progress indicator exists to disambiguate.
        //
        // Throttled to every PROGRESS_UPDATE_EVERY pages rather than every
        // page: one UPDATE per page would add a round-trip to each iteration
        // for no extra information, and the crawl is already paced by
        // REQUEST_DELAY_MS. `pagesDiscovered` rides along because the queue
        // grows as links are found, so it moves independently of the counter.
        if (pagesCrawled % PROGRESS_UPDATE_EVERY === 0) {
          await db
            .update(crawlRuns)
            .set({ pagesCrawled, pagesDiscovered: visited.size })
            .where(eq(crawlRuns.id, crawlRunId));
        }
      }
    }

    async function insertIssues(
      pageId: string,
      violations: { ruleKey: string; evidence: string }[]
    ) {
      if (violations.length === 0) return;

      const rows = violations
        .map((v) => {
          const ruleId = ruleIdByKey.get(v.ruleKey);
          const definition = ALL_RULES_BY_KEY.get(v.ruleKey);
          if (!ruleId || !definition) return null;
          return {
            pageId,
            ruleId,
            category: definition.category,
            severity: definition.severity,
            title: definition.title,
            description: definition.description,
            evidence: v.evidence,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        await db.insert(seoIssues).values(rows);
      }
    }

    async function crawlOnePage(item: QueueItem) {
      const { pathname, search } = new URL(item.url);
      if (!isPathAllowed(robotsRules, pathname + search)) {
        errors.push(`Blocked by robots.txt: ${item.url}`);
        return;
      }

      const startedAt = Date.now();
      try {
        const res = await safeFetch(item.url);
        const responseTime = Date.now() - startedAt;
        const isHtml = (res.contentType ?? "").includes("text/html");

        if (!isHtml) {
          const [nonHtmlPageRow] = await db
            .insert(pages)
            .values({
              websiteId: target.id,
              crawlRunId,
              url: item.url,
              statusCode: res.status,
              contentType: res.contentType,
              responseTime,
              pageSize: Buffer.byteLength(res.body, "utf-8"),
            })
            .returning({ id: pages.id });

          await insertIssues(
            nonHtmlPageRow.id,
            evaluateTechnicalPageIssues({
              finalUrl: res.finalUrl,
              statusCode: res.status,
              redirectCount: res.redirectCount,
              headers: res.headers,
            })
          );
          return;
        }

        // Phase 33 — Performance Optimization: parse this page's HTML into a
        // single cheerio DOM once and share it across every extractor below,
        // instead of each extractor calling `cheerio.load()` on its own
        // (previously ~10-11 independent re-parses of the same HTML per
        // page — see read.md's Phase 33 write-up for the measured
        // before/after). Every extractor still accepts a raw HTML string
        // too (unchanged for other callers/tests) — only this hot path
        // changes.
        const $ = cheerio.load(res.body);

        const extracted = extractPageData($);
        // Phase 24 content-structure signals (headings/lists/tables/FAQ
        // heading/question headings) — computed here, alongside every other
        // extraction, so they persist in the same insert (no second write).
        const contentStructure = extractContentStructure($);
        const pageHeadings = extractHeadings($);
        // Phase 25 — E-E-A-T / Trust: observable authorship/date markup,
        // extracted here alongside every other pass so it persists in the
        // same insert (no second fetch).
        const eeatSignals = extractEeatSignals($);

        const [pageRow] = await db
          .insert(pages)
          .values({
            websiteId: target.id,
            crawlRunId,
            url: item.url,
            statusCode: res.status,
            contentType: res.contentType,
            title: extracted.title,
            metaDescription: extracted.metaDescription,
            canonical: extracted.canonical,
            robots: extracted.robots,
            h1: extracted.h1,
            wordCount: extracted.wordCount,
            responseTime,
            pageSize: Buffer.byteLength(res.body, "utf-8"),
            headingsJson: pageHeadings,
            listCount: contentStructure.listCount,
            orderedListCount: contentStructure.orderedListCount,
            unorderedListCount: contentStructure.unorderedListCount,
            tableCount: contentStructure.tableCount,
            definitionListCount: contentStructure.definitionListCount,
            questionHeadingCount: contentStructure.questionHeadings.length,
            hasFaqHeading: contentStructure.hasFaqHeading,
            hasAuthorByline: eeatSignals.hasAuthorByline,
            hasRelAuthorLink: eeatSignals.hasRelAuthorLink,
            hasVisibleDate: eeatSignals.hasVisibleDate,
          })
          .returning({ id: pages.id });

        if (res.status < 200 || res.status >= 300) return;

        const pageLinks = extractLinks($, item.url, siteHostname);
        if (pageLinks.length > 0) {
          await db.insert(links).values(
            pageLinks.map((l) => ({
              pageId: pageRow.id,
              targetUrl: l.targetUrl,
              anchorText: l.anchorText,
              linkType: l.isInternal ? ("internal" as const) : ("external" as const),
              isInternal: l.isInternal,
            }))
          );
        }

        const pageImages = extractImages($, item.url);
        if (pageImages.length > 0) {
          await db.insert(images).values(
            pageImages.map((img) => ({
              pageId: pageRow.id,
              url: img.url,
              alt: img.alt,
              width: img.width,
              height: img.height,
              lazyLoaded: img.lazyLoaded,
            }))
          );
        }

        const headings = pageHeadings;
        const openGraph = extractOpenGraph($);
        const twitterCard = extractTwitterCard($);
        const hreflang = extractHreflang($);

        const violations = evaluatePageIssues({
          pageUrl: item.url,
          siteHostname,
          page: extracted,
          headings,
          openGraph,
          twitterCard,
          hreflang,
          images: pageImages,
          links: pageLinks,
        });
        const technicalViolations = evaluateTechnicalPageIssues({
          finalUrl: res.finalUrl,
          statusCode: res.status,
          redirectCount: res.redirectCount,
          headers: res.headers,
        });

        // Image Analysis (Phase 10): dimensions/format/srcset/LCP-lazy checks
        // are free (already-extracted markup); file size needs a live
        // Content-Length check, capped globally across the whole crawl.
        const imageViolations = evaluateImageIssues(pageImages);
        for (const img of pageImages) {
          if (imageSizeChecksRemaining <= 0) break;
          if (imageSizeCache.has(img.url)) continue;
          imageSizeChecksRemaining--;
          try {
            const imgRes = await safeFetch(img.url, { method: "HEAD", timeoutMs: 5000, maxRedirects: 5 });
            const contentLength = imgRes.headers["content-length"];
            const bytes = contentLength ? parseInt(String(contentLength), 10) : NaN;
            if (Number.isFinite(bytes)) imageSizeCache.set(img.url, bytes);
          } catch {
            // Unreachable/blocked image URLs aren't a file-size signal — skip silently.
          }
        }
        const imageSizeViolations = evaluateImageFileSizeIssues(pageImages, imageSizeCache);

        // Structured Data (Phase 11).
        const pageSchemas = extractStructuredData($);
        if (pageSchemas.length > 0) {
          await db.insert(schemas).values(
            pageSchemas.map((s) => ({
              pageId: pageRow.id,
              schemaType: s.schemaType,
              rawJson: s.rawJson,
              isValid: s.isValid,
              errors: s.errors,
              warnings: s.warnings,
            }))
          );
        }
        const schemaViolations = evaluateSchemaIssues(pageSchemas, item.url, siteHostname);

        // AI Search Intelligence (Phase 24): GEO/AEO readiness opportunity
        // rules from the same structural signals just extracted above.
        const aiSearchViolations = evaluateAiSearchPageIssues({
          wordCount: extracted.wordCount,
          headings: pageHeadings,
          listCount: contentStructure.listCount,
          tableCount: contentStructure.tableCount,
          schemaTypes: pageSchemas.map((s) => s.schemaType).filter((t): t is string => t !== null),
          externalLinks: pageLinks.filter((l) => !l.isInternal).map((l) => ({ anchorText: l.anchorText })),
        });
        if (pageSchemas.some((s) => s.schemaType === "Organization" || s.schemaType === "Person")) {
          siteHasEntitySchema = true;
        }

        // E-E-A-T / Trust (Phase 25) page-level: author/date signal rule,
        // gated to content-heavy pages, using the same author-schema-property
        // check as `computeWebsiteEeat` (not re-using Phase 24's
        // Organization/Person schema-existence check).
        const eeatViolations = evaluateEeatPageIssues({
          wordCount: extracted.wordCount,
          hasAuthorByline: eeatSignals.hasAuthorByline,
          hasRelAuthorLink: eeatSignals.hasRelAuthorLink,
          hasVisibleDate: eeatSignals.hasVisibleDate,
          schemaTypes: pageSchemas.map((s) => ({
            schemaType: s.schemaType,
            hasAuthorProperty: !!(s.rawJson && typeof s.rawJson === "object" && "author" in (s.rawJson as Record<string, unknown>)),
          })),
        });

        await insertIssues(pageRow.id, [
          ...violations,
          ...technicalViolations,
          ...imageViolations,
          ...imageSizeViolations,
          ...schemaViolations,
          ...aiSearchViolations,
          ...eeatViolations,
        ]);

        if (item.url === startUrl) homepagePageId = pageRow.id;

        if (queue.length < queueCap) {
          for (const link of pageLinks) {
            if (!link.isInternal) continue;
            if (item.depth + 1 > target.maxDepth) continue;
            if (visited.has(link.targetUrl)) continue;
            visited.add(link.targetUrl);
            queue.push({ url: link.targetUrl, depth: item.depth + 1 });
            if (queue.length >= queueCap) break;
          }
        }
      } catch (err) {
        const message = err instanceof CrawlFetchError ? err.message : "Unknown fetch error";
        errors.push(`${item.url}: ${message}`);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // Cross-page checks need the full set of pages/links from this run, so
    // they happen once crawling is done rather than per-page.
    const crawledPages = await db
      .select({
        id: pages.id,
        url: pages.url,
        title: pages.title,
        metaDescription: pages.metaDescription,
        statusCode: pages.statusCode,
        canonical: pages.canonical,
        robots: pages.robots,
      })
      .from(pages)
      .where(eq(pages.crawlRunId, crawlRunId));

    const duplicateIssues = evaluateDuplicateIssues(crawledPages);
    for (const issue of duplicateIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    const duplicateUrlIssues = evaluateDuplicateUrlVariants(crawledPages);
    for (const issue of duplicateUrlIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    if (homepagePageId) {
      const siteLevelIssues = evaluateSiteLevelIssues({
        robotsTxtFound: robotsRules.found,
        sitemapFound: sitemapAnalysis.found,
      });
      await insertIssues(homepagePageId, siteLevelIssues);

      // AI Search Intelligence (Phase 24) site-level check: does ANY
      // crawled page publish Organization/Person entity schema, not just
      // the homepage — a multi-location-page site might carry it on an
      // About page instead.
      await insertIssues(homepagePageId, evaluateAiSearchSiteIssues(siteHasEntitySchema));

      // E-E-A-T / Trust (Phase 25) site-level check: About/Contact/Privacy
      // page URL/title-pattern detection across every crawled page,
      // attached to the homepage row per the established site-level pattern.
      const successfulCrawledPages = crawledPages
        .filter((p) => p.statusCode !== null && p.statusCode >= 200 && p.statusCode < 300)
        .map((p) => ({ url: p.url, title: p.title }));
      await insertIssues(homepagePageId, evaluateEeatSiteIssues({ pages: successfulCrawledPages }));

      // robots.txt issues (Phase 13): syntax problems, whole-site/homepage
      // blocking, blocked render-critical resources, custom AI crawler rules.
      if (robotsRules.found) {
        await insertIssues(homepagePageId, evaluateRobotsIssues(robotsRules));

        // AI crawler intelligence (Phase 19): full per-crawler Allowed/
        // Blocked/Partial/Unknown verdict against the registry, reusing the
        // same robots.txt parse — attached to the homepage row like every
        // other site-level check in this run.
        await insertIssues(homepagePageId, evaluateAiCrawlerIssues(robotsRules));
      }

      // llms.txt / llms-full.txt (Phase 18): persist raw+parsed content per
      // file, then evaluate structural/link issues against it, attached to
      // the homepage row like every other site-level check in this run.
      if (llmsAnalysis) {
        for (const file of [llmsAnalysis.llmsTxt, llmsAnalysis.llmsFullTxt]) {
          await db.insert(llmsFiles).values({
            websiteId: target.id,
            crawlRunId,
            kind: file.kind,
            url: file.url,
            found: file.found,
            httpStatus: file.httpStatus,
            rawContent: file.rawContent,
            sizeBytes: file.sizeBytes,
            title: file.parsed?.title ?? null,
            summary: file.parsed?.summary ?? null,
            sections: file.parsed?.sections ?? null,
          });
        }
        await insertIssues(
          homepagePageId,
          evaluateLlmsIssues(llmsAnalysis.llmsTxt, llmsAnalysis.llmsFullTxt, siteHostname)
        );
      }

      // Sitemap document-level issues (Phase 12): HTTP errors, invalid XML,
      // duplicate/invalid URLs, protocol consistency, size limits, lastmod coverage.
      const siteIsHttps = new URL(target.url).protocol === "https:";
      for (const doc of sitemapAnalysis.documents) {
        const docViolations = evaluateSitemapDocumentIssues(doc, siteIsHttps);
        await insertIssues(homepagePageId, docViolations);
      }

      // Cross-reference sitemap URLs against this run's actual crawl results.
      const crawledPagesByUrl = new Map(
        crawledPages.map((p) => [
          p.url,
          { statusCode: p.statusCode, canonical: p.canonical, robots: p.robots },
        ])
      );
      const pageIdByUrl = new Map(crawledPages.map((p) => [p.url, p.id]));

      const sitemapUrlIssues = evaluateSitemapUrlCrossReference(sitemapAnalysis.allUrls, crawledPagesByUrl);
      for (const issue of sitemapUrlIssues) {
        const targetPageId = pageIdByUrl.get(issue.url);
        if (targetPageId) {
          await insertIssues(targetPageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
        }
      }
    }

    const crawlRunLinks = await db
      .select({
        sourcePageId: links.pageId,
        targetUrl: links.targetUrl,
        anchorText: links.anchorText,
        isInternal: links.isInternal,
      })
      .from(links)
      .innerJoin(pages, eq(links.pageId, pages.id))
      .where(eq(pages.crawlRunId, crawlRunId));

    const internalLinks = crawlRunLinks.filter((l) => l.isInternal);

    const linkedInternalUrls = new Set(internalLinks.map((l) => l.targetUrl));
    const orphanIssues = evaluateOrphanPages(crawledPages, linkedInternalUrls, startUrl);
    for (const issue of orphanIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    const blockedLinkIssues = evaluateBlockedInternalLinks(internalLinks, (path) =>
      isPathAllowed(robotsRules, path)
    );
    for (const issue of blockedLinkIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    // Link Analysis (Phase 9): broken/redirecting links + weak anchor text.
    // Targets already crawled in this run get their status for free; a
    // small, capped number of not-yet-known targets (external links, or
    // internal links outside this run's page/depth budget) get a
    // lightweight live HEAD check through the same SSRF-safe fetcher.
    const statusByUrl = new Map<string, LinkStatus>();
    for (const page of crawledPages) {
      if (page.statusCode !== null) {
        statusByUrl.set(page.url, { statusCode: page.statusCode, redirectCount: -1 });
      }
    }

    const uncheckedTargets = Array.from(
      new Set(crawlRunLinks.map((l) => l.targetUrl).filter((url) => !statusByUrl.has(url)))
    ).slice(0, MAX_LIVE_LINK_CHECKS);

    for (const target of uncheckedTargets) {
      await new Promise((r) => setTimeout(r, LINK_CHECK_DELAY_MS));
      try {
        const res = await safeFetch(target, { method: "HEAD", timeoutMs: 5000, maxRedirects: 5 });
        statusByUrl.set(target, { statusCode: res.status, redirectCount: res.redirectCount });
      } catch (err) {
        if (err instanceof CrawlFetchError && (err.kind === "dns_failure" || err.kind === "timeout" || err.kind === "network_error" || err.kind === "too_many_redirects")) {
          statusByUrl.set(target, { statusCode: null, redirectCount: -1 });
        }
        // blocked_protocol / blocked_ip / too_large: not a "broken link" signal — skip silently.
      }
    }

    const linkIssues = evaluateLinkIssues(
      crawlRunLinks.map((l) => ({
        pageId: l.sourcePageId,
        targetUrl: l.targetUrl,
        anchorText: l.anchorText,
        isInternal: l.isInternal ?? false,
      })),
      statusByUrl
    );
    for (const issue of linkIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    // Organization-name consistency (Phase 11) needs every page's schema
    // data, so it runs as a cross-page pass like the other consistency checks.
    const organizationSchemas = await db
      .select({ pageId: schemas.pageId, rawJson: schemas.rawJson })
      .from(schemas)
      .innerJoin(pages, eq(schemas.pageId, pages.id))
      .where(and(eq(pages.crawlRunId, crawlRunId), eq(schemas.schemaType, "Organization")));

    const organizationEntries = organizationSchemas
      .map((s) => {
        const name =
          s.rawJson && typeof s.rawJson === "object" && typeof (s.rawJson as Record<string, unknown>).name === "string"
            ? ((s.rawJson as Record<string, unknown>).name as string)
            : null;
        return name ? { pageId: s.pageId, organizationName: name } : null;
      })
      .filter((e): e is { pageId: string; organizationName: string } => e !== null);

    const organizationIssues = evaluateOrganizationConsistency(organizationEntries);
    for (const issue of organizationIssues) {
      await insertIssues(issue.pageId, [{ ruleKey: issue.ruleKey, evidence: issue.evidence }]);
    }

    await db
      .update(crawlRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        pagesDiscovered: visited.size,
        pagesCrawled,
        errors,
      })
      .where(eq(crawlRuns.id, crawlRunId));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Unknown crawl error");
    await db
      .update(crawlRuns)
      .set({ status: "failed", completedAt: new Date(), errors })
      .where(eq(crawlRuns.id, crawlRunId));
  }
}
