import * as cheerio from "cheerio";
import { normalizeCrawlUrl } from "./normalize-url";

// Phase 33 — Performance Optimization: every extractor below used to call
// `cheerio.load(html)` on its own, independently re-parsing the exact same
// HTML string. Since Phase 24/25 added several more extractors on top of
// Phase 6/7's original ones, a single crawled page was being parsed into a
// fresh DOM tree ~10-11 separate times in `run-crawl.ts`'s per-page hot
// path — real, measured overhead (see read.md's Phase 33 write-up for a
// before/after benchmark). Each extractor now accepts either a raw HTML
// string (unchanged, backward-compatible — every existing unit test and
// every non-crawl caller like the Phase 29 AI re-fetch path keeps working
// exactly as before) OR an already-loaded `cheerio.CheerioAPI`, so
// `run-crawl.ts` can load the page's HTML into a `$` exactly once per page
// and hand that same `$` to every extractor, at zero behavior change.
type HtmlInput = string | cheerio.CheerioAPI;

function loadHtml(input: HtmlInput): cheerio.CheerioAPI {
  return typeof input === "string" ? cheerio.load(input) : input;
}

export interface ExtractedPage {
  title: string | null;
  titleTagExists: boolean;
  metaDescription: string | null;
  metaDescriptionTagExists: boolean;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  wordCount: number;
}

export interface ExtractedLink {
  targetUrl: string;
  anchorText: string | null;
  isInternal: boolean;
}

export interface ExtractedImage {
  url: string;
  alt: string | null;
  /**
   * Whether the alt attribute is present at all (even if empty). An empty
   * `alt=""` is valid, intentional markup for a decorative image — it must
   * not be treated the same as a missing alt attribute entirely.
   */
  altAttributeExists: boolean;
  width: number | null;
  height: number | null;
  lazyLoaded: boolean;
  hasSrcset: boolean;
}

export interface ExtractedHeading {
  level: number;
  text: string;
}

export function extractHeadings(html: HtmlInput): ExtractedHeading[] {
  const $ = loadHtml(html);
  const headings: ExtractedHeading[] = [];

  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName.slice(1), 10);
    const text = $(el).text().replace(/\s+/g, " ").trim();
    headings.push({ level, text });
  });

  return headings;
}

// ─── Content Structure (Phase 24 — AI Search Intelligence) ───────────────────
//
// Deterministic HTML/markup-structure signals that feed the GEO/AEO
// readiness dimensions the master doc names as genuinely assessable without
// AI/NLP (Section 39/44-46, Section 79 #3): Headings, Lists, Tables, FAQ
// Structures, Question Coverage, Content Chunkability. These are pure
// counts/pattern-matches over already-fetched HTML — no new external call,
// same "deterministic first" approach as every prior phase.

export interface ExtractedContentStructure {
  listCount: number;
  orderedListCount: number;
  unorderedListCount: number;
  tableCount: number;
  definitionListCount: number;
  /** Headings whose text matches a question-shaped pattern (see isQuestionHeading). */
  questionHeadings: string[];
  /** True if any heading text reads as an FAQ section label (e.g. "Frequently Asked Questions"). */
  hasFaqHeading: boolean;
}

/**
 * A defensible, narrow text-pattern heuristic for "this heading reads as a
 * question" — not an NLP/semantic judgment. Matches headings ending in "?"
 * or starting with a common interrogative/how-to phrase. Intentionally
 * conservative (few false positives) rather than exhaustive.
 */
export function isQuestionHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.endsWith("?")) return true;
  return /^(what|why|how|when|where|who|which|can|does|do|is|are|should|will)\b/i.test(trimmed);
}

/** A defensible, narrow text-pattern heuristic for an FAQ section heading. */
export function isFaqHeading(text: string): boolean {
  return /\bfaq'?s?\b|frequently asked questions/i.test(text.trim());
}

export function extractContentStructure(html: HtmlInput): ExtractedContentStructure {
  const $ = loadHtml(html);

  const unorderedListCount = $("ul").length;
  const orderedListCount = $("ol").length;
  const tableCount = $("table").length;
  const definitionListCount = $("dl").length;

  const headings = extractHeadings($);
  const questionHeadings = headings.filter((h) => isQuestionHeading(h.text)).map((h) => h.text);
  const hasFaqHeading = headings.some((h) => isFaqHeading(h.text));

  return {
    listCount: unorderedListCount + orderedListCount,
    orderedListCount,
    unorderedListCount,
    tableCount,
    definitionListCount,
    questionHeadings,
    hasFaqHeading,
  };
}

// ─── E-E-A-T / Trust signals (Phase 25) ──────────────────────────────────────
//
// Deterministic, observable trust/authorship markers — deliberately NOT the
// Organization/Person JSON-LD *existence* check (that's Phase 24's Entity
// Clarity/Source Identity, already implemented in `src/lib/ai-search/readiness.ts`
// and not duplicated here). This phase looks at what Phase 24 explicitly
// deferred: visible on-page authorship markup (byline text, `rel="author"`
// links) and visible publish/modified dates — the kind of markers Google's
// public E-E-A-T guidance describes wanting to see, not a re-implementation
// of schema-presence detection. Master doc Section 79 #5/#8: never claim to
// measure Google's actual internal E-E-A-T ranking signal, and never invent
// authorship — only report what is actually present in the markup.

export interface ExtractedEeatSignals {
  /** A "By [Name]" / "Written by" / "Author:" text pattern found in the page body (checked near the top of the content, not buried in footer/comments). */
  hasAuthorByline: boolean;
  /** An <a rel="author"> link is present anywhere on the page. */
  hasRelAuthorLink: boolean;
  /** A <time> element or a common published/modified date meta tag is present. */
  hasVisibleDate: boolean;
}

// Matches "By John Smith", "Written by Jane Doe", "Author: A. B. Carter" —
// requires a capitalized name-shaped token to follow, to avoid matching
// unrelated prose that merely contains the word "by" (e.g. "powered by").
const BYLINE_PATTERN = /\b(?:[Bb]y|[Ww]ritten by|[Aa]uthor)\s*:?\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,3}/;

// Only scan the first slice of body text (and any element carrying an
// "author"/"byline" class or itemprop) — bylines are a top-of-article
// convention; matching this pattern anywhere in a long page risks false
// positives in unrelated body copy or comments.
const BYLINE_SCAN_CHARS = 1500;

const DATE_META_SELECTORS = [
  'meta[property="article:published_time"]',
  'meta[property="article:modified_time"]',
  'meta[name="date"]',
  'meta[name="publish-date"]',
  'meta[itemprop="datePublished"]',
  'meta[itemprop="dateModified"]',
].join(", ");

export function extractEeatSignals(html: HtmlInput): ExtractedEeatSignals {
  const $ = loadHtml(html);

  const hasRelAuthorLink = $('a[rel~="author"]').length > 0;

  // Dedicated author/byline-classed elements are checked first (lowest
  // false-positive risk), then a bounded scan of the opening body text as a
  // fallback for sites that don't use a semantic class name.
  const BYLINE_CLASS_RE = /\b(author|byline)\b/i;
  const bylineEl = $("[class], [itemprop]")
    .filter((_, el) => {
      const cls = $(el).attr("class") ?? "";
      const itemprop = $(el).attr("itemprop") ?? "";
      return BYLINE_CLASS_RE.test(cls) || itemprop === "author";
    })
    .first();
  const bylineElementText = bylineEl.text().replace(/\s+/g, " ").trim();
  // Join each text node with a space (rather than $("body").text(), which
  // concatenates adjacent block elements with no separator, e.g.
  // "<h1>Title</h1><p>By Jane</p>" -> "TitleBy Jane" — that would make the
  // byline pattern miss a "by" glued onto the previous element's text).
  const bodyLeadText = $("body")
    .find("*")
    .addBack()
    .contents()
    .filter((_, el) => el.type === "text")
    .map((_, el) => $(el).text())
    .get()
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BYLINE_SCAN_CHARS);
  const hasAuthorByline =
    (bylineElementText.length > 0 && bylineElementText.length < 200) ||
    BYLINE_PATTERN.test(bodyLeadText);

  const hasVisibleDate = $("time").length > 0 || $(DATE_META_SELECTORS).length > 0;

  return { hasAuthorByline, hasRelAuthorLink, hasVisibleDate };
}

export function extractOpenGraph(html: HtmlInput): Record<string, string> {
  const $ = loadHtml(html);
  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) og[property] = content;
  });
  return og;
}

export function extractTwitterCard(html: HtmlInput): Record<string, string> {
  const $ = loadHtml(html);
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) twitter[name] = content;
  });
  return twitter;
}

export interface ExtractedHreflang {
  lang: string;
  href: string;
}

export function extractHreflang(html: HtmlInput): ExtractedHreflang[] {
  const $ = loadHtml(html);
  const entries: ExtractedHreflang[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang");
    const href = $(el).attr("href");
    if (lang && href) entries.push({ lang, href });
  });
  return entries;
}

export function extractPageData(html: HtmlInput): ExtractedPage {
  const $ = loadHtml(html);

  const titleEl = $("title").first();
  const titleTagExists = titleEl.length > 0;
  const title = titleEl.text().trim() || null;

  const metaDescriptionEl = $('meta[name="description"]');
  const metaDescriptionTagExists = metaDescriptionEl.length > 0;
  const metaDescription = metaDescriptionEl.attr("content")?.trim() || null;

  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || null;
  const robots = $('meta[name="robots"]').attr("content")?.trim() || null;
  const h1 = $("h1").first().text().trim() || null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.length > 0 ? bodyText.split(" ").length : 0;

  return {
    title,
    titleTagExists,
    metaDescription,
    metaDescriptionTagExists,
    canonical,
    robots,
    h1,
    wordCount,
  };
}

/**
 * Phase 29 — plain visible body text, stripped of script/style/nav/footer
 * noise. Used only transiently (never persisted to `pages`) by the AI
 * gateway's page-content fetch: Phase 24 deliberately never persisted full
 * body text to the DB (only `wordCount` + structural counts), so Phase 29's
 * AI-analysis triggers re-fetch the page live via `safeFetch` at the moment
 * the user asks for an AI assessment, same "expensive triggered job, not
 * stored inline with every crawl" pattern as Phase 20's Lighthouse audits.
 */
export function extractBodyText(html: HtmlInput): string {
  const $ = loadHtml(html);
  $("script, style, noscript, nav, footer, header, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function extractLinks(html: HtmlInput, pageUrl: string, siteHostname: string): ExtractedLink[] {
  const $ = loadHtml(html);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

    const normalized = normalizeCrawlUrl(href, pageUrl);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const anchorText = $(el).text().replace(/\s+/g, " ").trim() || null;
    let isInternal = false;
    try {
      isInternal = new URL(normalized).hostname.toLowerCase() === siteHostname.toLowerCase();
    } catch {
      // leave as external
    }

    links.push({ targetUrl: normalized, anchorText, isInternal });
  });

  return links;
}

export function extractImages(html: HtmlInput, pageUrl: string): ExtractedImage[] {
  const $ = loadHtml(html);
  const images: ExtractedImage[] = [];
  const seen = new Set<string>();

  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;

    const normalized = normalizeCrawlUrl(src, pageUrl);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);

    const widthAttr = $(el).attr("width");
    const heightAttr = $(el).attr("height");
    const loading = $(el).attr("loading");

    images.push({
      url: normalized,
      alt: $(el).attr("alt")?.trim() || null,
      altAttributeExists: $(el).attr("alt") !== undefined,
      width: widthAttr && /^\d+$/.test(widthAttr) ? parseInt(widthAttr, 10) : null,
      height: heightAttr && /^\d+$/.test(heightAttr) ? parseInt(heightAttr, 10) : null,
      lazyLoaded: loading === "lazy",
      hasSrcset: $(el).attr("srcset") !== undefined,
    });
  });

  return images;
}

// ─── Structured Data (JSON-LD / Microdata / RDFa) ────────────────────────────

export interface ExtractedSchema {
  format: "json-ld" | "microdata" | "rdfa";
  schemaType: string | null;
  rawJson: unknown | null;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function typeNameFromItemtype(itemtype: string | undefined): string | null {
  if (!itemtype) return null;
  const first = itemtype.trim().split(/\s+/)[0];
  const segments = first.split("/").filter(Boolean);
  return segments[segments.length - 1] || null;
}

function normalizeJsonLdType(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * Extracts structured data in all three formats the master doc names as
 * primary focus (Section 21). JSON-LD gets full parsing and validation
 * (it's the dominant, Google-recommended format); Microdata and RDFa get
 * type-level detection only — deep per-attribute validation of those
 * formats is a much larger undertaking than their real-world usage share
 * justifies here.
 */
export function extractStructuredData(html: HtmlInput): ExtractedSchema[] {
  const $ = loadHtml(html);
  const results: ExtractedSchema[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      results.push({
        format: "json-ld",
        schemaType: null,
        rawJson: null,
        isValid: false,
        errors: [`Invalid JSON: ${err instanceof Error ? err.message : "parse error"}`],
        warnings: [],
      });
      return;
    }

    const entities: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["@graph"])
        ? ((parsed as Record<string, unknown>)["@graph"] as unknown[])
        : [parsed];

    for (const entity of entities) {
      if (!entity || typeof entity !== "object") continue;
      const record = entity as Record<string, unknown>;
      const schemaType = normalizeJsonLdType(record["@type"]);
      results.push({
        format: "json-ld",
        schemaType,
        rawJson: entity,
        isValid: true,
        errors: [],
        warnings: schemaType ? [] : ["No @type property found."],
      });
    }
  });

  $("[itemscope]").each((_, el) => {
    if ($(el).parents("[itemscope]").length > 0) return; // only top-level entities
    const itemtype = $(el).attr("itemtype");
    results.push({
      format: "microdata",
      schemaType: typeNameFromItemtype(itemtype),
      rawJson: null,
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  $("[typeof]").each((_, el) => {
    if ($(el).parents("[typeof]").length > 0) return; // only top-level entities
    const typeOf = $(el).attr("typeof")?.trim() || null;
    results.push({
      format: "rdfa",
      schemaType: typeOf ? typeOf.split(/\s+/)[0].split(":").pop() ?? typeOf : null,
      rawJson: null,
      isValid: true,
      errors: [],
      warnings: [],
    });
  });

  return results;
}
