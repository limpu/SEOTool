import type {
  ExtractedHeading,
  ExtractedHreflang,
  ExtractedImage,
  ExtractedLink,
  ExtractedPage,
} from "@/lib/crawler/extract";

export interface RuleViolation {
  ruleKey: string;
  evidence: string;
}

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_DESCRIPTION_MIN = 50;
const META_DESCRIPTION_MAX = 160;

export interface OnPageAnalysisInput {
  pageUrl: string;
  siteHostname: string;
  page: ExtractedPage;
  headings: ExtractedHeading[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  hreflang: ExtractedHreflang[];
  images: ExtractedImage[];
  links: ExtractedLink[];
}

/**
 * Evaluates every single-page on-page rule (everything except cross-page
 * duplicate detection, which needs the full set of crawled pages — see
 * `evaluateDuplicateIssues`). Pure function: no I/O, no DB access.
 */
export function evaluatePageIssues(input: OnPageAnalysisInput): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { page, headings, openGraph, twitterCard, hreflang, images, links, pageUrl, siteHostname } = input;

  // ─── Title ───────────────────────────────────────────────────────────────
  if (!page.titleTagExists) {
    violations.push({ ruleKey: "ONPAGE_TITLE_MISSING", evidence: "No <title> element found." });
  } else if (!page.title) {
    violations.push({ ruleKey: "ONPAGE_TITLE_EMPTY", evidence: "<title> element is empty." });
  } else {
    if (page.title.length < TITLE_MIN) {
      violations.push({
        ruleKey: "ONPAGE_TITLE_TOO_SHORT",
        evidence: `Title is ${page.title.length} characters: "${page.title}"`,
      });
    } else if (page.title.length > TITLE_MAX) {
      violations.push({
        ruleKey: "ONPAGE_TITLE_TOO_LONG",
        evidence: `Title is ${page.title.length} characters: "${page.title}"`,
      });
    }
  }

  // ─── Meta Description ───────────────────────────────────────────────────
  if (!page.metaDescriptionTagExists) {
    violations.push({
      ruleKey: "ONPAGE_META_DESCRIPTION_MISSING",
      evidence: "No meta description tag found.",
    });
  } else if (!page.metaDescription) {
    violations.push({
      ruleKey: "ONPAGE_META_DESCRIPTION_EMPTY",
      evidence: "Meta description tag has no content.",
    });
  } else {
    if (page.metaDescription.length < META_DESCRIPTION_MIN) {
      violations.push({
        ruleKey: "ONPAGE_META_DESCRIPTION_TOO_SHORT",
        evidence: `Meta description is ${page.metaDescription.length} characters.`,
      });
    } else if (page.metaDescription.length > META_DESCRIPTION_MAX) {
      violations.push({
        ruleKey: "ONPAGE_META_DESCRIPTION_TOO_LONG",
        evidence: `Meta description is ${page.metaDescription.length} characters.`,
      });
    }
  }

  // ─── Headings ────────────────────────────────────────────────────────────
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    violations.push({ ruleKey: "ONPAGE_H1_MISSING", evidence: "No H1 element found." });
  } else if (h1s.length > 1) {
    violations.push({
      ruleKey: "ONPAGE_H1_MULTIPLE",
      evidence: `Found ${h1s.length} H1 elements.`,
    });
  } else if (!h1s[0].text) {
    violations.push({ ruleKey: "ONPAGE_H1_EMPTY", evidence: "The H1 element has no text." });
  }

  const emptyNonH1 = headings.filter((h) => h.level !== 1 && !h.text);
  if (emptyNonH1.length > 0) {
    violations.push({
      ruleKey: "ONPAGE_HEADING_EMPTY",
      evidence: `${emptyNonH1.length} empty heading(s) (H2-H6).`,
    });
  }

  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0 && heading.level > previousLevel + 1) {
      violations.push({
        ruleKey: "ONPAGE_HEADING_HIERARCHY_SKIP",
        evidence: `Heading jumps from H${previousLevel} to H${heading.level} ("${heading.text}").`,
      });
      break; // one flag per page is enough signal; avoid noisy repeats
    }
    previousLevel = heading.level;
  }

  // ─── Canonical ───────────────────────────────────────────────────────────
  if (!page.canonical) {
    violations.push({ ruleKey: "ONPAGE_CANONICAL_MISSING", evidence: "No canonical tag found." });
  } else {
    try {
      const canonicalHost = new URL(page.canonical, pageUrl).hostname.toLowerCase();
      if (canonicalHost !== siteHostname.toLowerCase()) {
        violations.push({
          ruleKey: "ONPAGE_CANONICAL_CROSS_DOMAIN",
          evidence: `Canonical points to ${canonicalHost}, not ${siteHostname}.`,
        });
      }
    } catch {
      // Unparsable canonical URL — no separate rule for this in Phase 7's scope.
    }
  }

  // ─── Robots ──────────────────────────────────────────────────────────────
  if (page.robots && /noindex/i.test(page.robots)) {
    violations.push({
      ruleKey: "ONPAGE_ROBOTS_NOINDEX",
      evidence: `robots meta content: "${page.robots}"`,
    });
  }

  // ─── Open Graph ──────────────────────────────────────────────────────────
  if (!openGraph["og:title"]) {
    violations.push({ ruleKey: "ONPAGE_OG_MISSING_TITLE", evidence: "No og:title tag found." });
  }
  if (!openGraph["og:description"]) {
    violations.push({
      ruleKey: "ONPAGE_OG_MISSING_DESCRIPTION",
      evidence: "No og:description tag found.",
    });
  }
  if (!openGraph["og:image"]) {
    violations.push({ ruleKey: "ONPAGE_OG_MISSING_IMAGE", evidence: "No og:image tag found." });
  }

  // ─── Twitter/X ───────────────────────────────────────────────────────────
  if (!twitterCard["twitter:card"]) {
    violations.push({
      ruleKey: "ONPAGE_TWITTER_MISSING_CARD",
      evidence: "No twitter:card tag found.",
    });
  }

  // ─── Hreflang ────────────────────────────────────────────────────────────
  if (hreflang.length > 0) {
    const hasSelfReference = hreflang.some((entry) => {
      try {
        return new URL(entry.href, pageUrl).toString() === new URL(pageUrl).toString();
      } catch {
        return false;
      }
    });
    if (!hasSelfReference) {
      violations.push({
        ruleKey: "ONPAGE_HREFLANG_MISSING_SELF",
        evidence: `${hreflang.length} hreflang alternate(s) declared, none self-referencing.`,
      });
    }
  }

  // ─── Images (basic) ──────────────────────────────────────────────────────
  // Only the alt attribute being absent entirely is flagged — alt="" is
  // valid, intentional markup for a decorative image and must not be
  // treated as an error (Section 28's "decorative image handling").
  const missingAlt = images.filter((img) => !img.altAttributeExists);
  if (missingAlt.length > 0) {
    violations.push({
      ruleKey: "ONPAGE_IMAGE_MISSING_ALT",
      evidence: `${missingAlt.length} of ${images.length} image(s) missing an alt attribute.`,
    });
  }

  // ─── Links (basic) ───────────────────────────────────────────────────────
  const emptyAnchors = links.filter((l) => !l.anchorText);
  if (emptyAnchors.length > 0) {
    violations.push({
      ruleKey: "ONPAGE_LINK_EMPTY_ANCHOR",
      evidence: `${emptyAnchors.length} link(s) with no visible anchor text.`,
    });
  }

  return violations;
}

export interface DuplicateCheckPage {
  id: string;
  title: string | null;
  metaDescription: string | null;
}

export interface DuplicateIssue {
  pageId: string;
  ruleKey: "ONPAGE_TITLE_DUPLICATE" | "ONPAGE_META_DESCRIPTION_DUPLICATE";
  evidence: string;
}

/**
 * Flags titles/descriptions shared by more than one page in the same crawl.
 * Needs the full set of crawled pages, so it runs as a second pass after
 * the crawl completes rather than per-page during crawling.
 */
export function evaluateDuplicateIssues(pages: DuplicateCheckPage[]): DuplicateIssue[] {
  const issues: DuplicateIssue[] = [];

  const byTitle = groupBy(pages.filter((p) => p.title), (p) => p.title as string);
  for (const [title, group] of byTitle) {
    if (group.length < 2) continue;
    for (const p of group) {
      issues.push({
        pageId: p.id,
        ruleKey: "ONPAGE_TITLE_DUPLICATE",
        evidence: `Shared with ${group.length - 1} other page(s): "${title}"`,
      });
    }
  }

  const byDescription = groupBy(
    pages.filter((p) => p.metaDescription),
    (p) => p.metaDescription as string
  );
  for (const [, group] of byDescription) {
    if (group.length < 2) continue;
    for (const p of group) {
      issues.push({
        pageId: p.id,
        ruleKey: "ONPAGE_META_DESCRIPTION_DUPLICATE",
        evidence: `Shared with ${group.length - 1} other page(s).`,
      });
    }
  }

  return issues;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}
