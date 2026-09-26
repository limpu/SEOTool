/**
 * Stage 2 / Stage 3A — presentation configuration for the eight issue-based
 * module reports: Technical SEO, On-Page SEO, Schema, Sitemap, Robots.txt
 * (Stage 2) and PageSpeed, AI Search Intelligence, E-E-A-T / Trust (Stage 3A).
 *
 * Pure: no React, no DOM, no Next, no DB. Everything here is a label, a route
 * segment, or a deterministic rule-key → topic lookup, so all of it is
 * directly unit-testable (`tests/unit/report-module-definitions.test.ts`).
 *
 * WHY A "TOPIC" AXIS EXISTS AT ALL
 * --------------------------------
 * Stage 1's `IssueFilterBar` facets on `ReportIssue.category`. For Site Audit
 * that axis is the DB `issue_category` enum, which genuinely varies. Inside a
 * single module it does NOT: every `ONPAGE_*` rule is persisted as `on_page`,
 * and every `TECH_*`/`SITEMAP_*`/`ROBOTS_*` rule is persisted as `technical`
 * (see `src/lib/module-reports/compute.ts`'s own note on why rule-key prefix,
 * not category, separates the five modules). A category facet inside a module
 * would therefore be a single always-on chip — chrome that filters nothing.
 *
 * So each module supplies its own topic vocabulary here, and the shared
 * components are handed `category = topicKey`. Nothing about the filter,
 * facet, grouping or URL code changes; it is the same module-agnostic axis
 * pointed at a more useful value.
 *
 * The mapping is by EXACT rule key, never by substring. A rule added to a
 * registry later falls into "Other findings" and stays visible, filterable and
 * counted, rather than being silently swallowed by a prefix match that happens
 * to fit or dropped from the facet list entirely. Being visibly unclassified
 * is honest; being quietly mis-bucketed is not.
 *
 * No `src/lib` business logic, API route or DB schema is touched by this file
 * or by anything in Stage 2 — the rule keys below are read from the existing
 * registries in `src/lib/seo-rules/`.
 */

import type { ModuleKey } from "@/lib/module-reports/compute";

export interface ModuleTopic {
  /** Stable facet value — appears in `?category=…`, so it must stay URL-safe. */
  key: string;
  label: string;
  /** Exact rule keys that belong to this topic. */
  ruleKeys: string[];
}

export interface ModuleDefinition {
  key: ModuleKey;
  /**
   * Route segment under `/websites/[id]/` AND the `nav.ts` slug. They are
   * deliberately the same string: the sidebar entry and the report route must
   * never be able to drift apart, and `requireWorkspacePage` resolves the
   * feature key from this slug.
   */
  slug: string;
  label: string;
  /** One sentence stating exactly what this report covers. Shown on the Overview. */
  description: string;
  /** Noun used in list copy ("3 of 22 findings match"). */
  topics: ModuleTopic[];
}

export const OTHER_TOPIC_KEY = "other";
export const OTHER_TOPIC_LABEL = "Other findings";

export const MODULE_DEFINITIONS: Record<ModuleKey, ModuleDefinition> = {
  technical: {
    key: "technical",
    slug: "technical",
    label: "Technical SEO",
    description:
      "Crawlability, indexability, redirects, HTTP status codes and transport security, from the most recent completed crawl.",
    topics: [
      {
        key: "indexability",
        label: "Indexability",
        ruleKeys: ["TECH_NOINDEX_VIA_HEADER", "TECH_BLOCKED_BY_ROBOTS_TXT"],
      },
      {
        key: "crawlability",
        label: "Crawlability",
        ruleKeys: ["TECH_ORPHAN_PAGE", "TECH_ROBOTS_TXT_MISSING", "TECH_SITEMAP_MISSING"],
      },
      {
        key: "redirects",
        label: "Redirects",
        ruleKeys: ["TECH_REDIRECT_DETECTED", "TECH_REDIRECT_CHAIN_TOO_LONG"],
      },
      {
        key: "status_codes",
        label: "Status codes",
        ruleKeys: ["TECH_CLIENT_ERROR_STATUS", "TECH_SERVER_ERROR_STATUS"],
      },
      {
        key: "security",
        label: "Security & HTTPS",
        ruleKeys: [
          "TECH_NOT_HTTPS",
          "TECH_MISSING_HSTS",
          "TECH_MISSING_X_CONTENT_TYPE_OPTIONS",
          "TECH_MISSING_REFERRER_POLICY",
        ],
      },
      {
        key: "duplicate_urls",
        label: "Duplicate URLs",
        ruleKeys: ["TECH_DUPLICATE_URL_QUERY_VARIANT"],
      },
    ],
  },

  on_page: {
    key: "on_page",
    slug: "on-page",
    label: "On-Page SEO",
    description:
      "Titles, meta descriptions, headings, canonicals, social preview tags, image alt text and link anchors across every crawled page.",
    topics: [
      {
        key: "titles",
        label: "Titles",
        ruleKeys: [
          "ONPAGE_TITLE_MISSING",
          "ONPAGE_TITLE_EMPTY",
          "ONPAGE_TITLE_TOO_SHORT",
          "ONPAGE_TITLE_TOO_LONG",
          "ONPAGE_TITLE_DUPLICATE",
        ],
      },
      {
        key: "meta_descriptions",
        label: "Meta descriptions",
        ruleKeys: [
          "ONPAGE_META_DESCRIPTION_MISSING",
          "ONPAGE_META_DESCRIPTION_EMPTY",
          "ONPAGE_META_DESCRIPTION_TOO_SHORT",
          "ONPAGE_META_DESCRIPTION_TOO_LONG",
          "ONPAGE_META_DESCRIPTION_DUPLICATE",
        ],
      },
      {
        key: "headings",
        label: "Headings",
        ruleKeys: [
          "ONPAGE_H1_MISSING",
          "ONPAGE_H1_MULTIPLE",
          "ONPAGE_H1_EMPTY",
          "ONPAGE_HEADING_EMPTY",
          "ONPAGE_HEADING_HIERARCHY_SKIP",
        ],
      },
      {
        key: "canonical",
        label: "Canonical & indexing",
        ruleKeys: [
          "ONPAGE_CANONICAL_MISSING",
          "ONPAGE_CANONICAL_CROSS_DOMAIN",
          "ONPAGE_ROBOTS_NOINDEX",
          "ONPAGE_HREFLANG_MISSING_SELF",
        ],
      },
      {
        key: "social",
        label: "Social previews",
        ruleKeys: [
          "ONPAGE_OG_MISSING_TITLE",
          "ONPAGE_OG_MISSING_DESCRIPTION",
          "ONPAGE_OG_MISSING_IMAGE",
          "ONPAGE_TWITTER_MISSING_CARD",
        ],
      },
      { key: "images", label: "Images", ruleKeys: ["ONPAGE_IMAGE_MISSING_ALT"] },
      { key: "links", label: "Links", ruleKeys: ["ONPAGE_LINK_EMPTY_ANCHOR"] },
    ],
  },

  schema: {
    key: "schema",
    slug: "schema",
    label: "Schema",
    description:
      "Structured-data (JSON-LD) markup found while crawling: which types are published, whether each block parses, and what is missing.",
    topics: [
      {
        key: "validity",
        label: "Markup validity",
        ruleKeys: ["SCHEMA_INVALID_JSON", "SCHEMA_MISSING_TYPE"],
      },
      {
        key: "completeness",
        label: "Required properties",
        ruleKeys: ["SCHEMA_MISSING_REQUIRED_PROPERTY"],
      },
      {
        key: "consistency",
        label: "Consistency",
        ruleKeys: ["SCHEMA_DUPLICATE_TYPE", "SCHEMA_ORGANIZATION_NAME_INCONSISTENT", "SCHEMA_URL_MISMATCH"],
      },
    ],
  },

  sitemap: {
    key: "sitemap",
    slug: "sitemap",
    label: "Sitemap",
    description:
      "The XML sitemap discovered during the last crawl: whether it parses, what it lists, and how those URLs compare with what the crawler actually found.",
    topics: [
      {
        key: "document",
        label: "Sitemap file",
        ruleKeys: ["SITEMAP_HTTP_ERROR", "SITEMAP_INVALID_XML", "SITEMAP_TOO_MANY_URLS"],
      },
      {
        key: "listed_urls",
        label: "Listed URLs",
        ruleKeys: [
          "SITEMAP_INVALID_URL",
          "SITEMAP_DUPLICATE_URL",
          "SITEMAP_HTTP_URL_ON_HTTPS_SITE",
          "SITEMAP_URL_MISSING_LASTMOD",
        ],
      },
      {
        key: "cross_reference",
        label: "Crawl cross-reference",
        ruleKeys: ["SITEMAP_URL_BROKEN", "SITEMAP_URL_NOT_INDEXABLE", "SITEMAP_URL_CANONICAL_MISMATCH"],
      },
    ],
  },

  robots: {
    key: "robots",
    slug: "robots",
    label: "Robots.txt",
    description:
      "What your robots.txt file tells crawlers they may and may not fetch — plus any lines that do not parse, and any rules written for named AI crawlers.",
    topics: [
      {
        key: "access",
        label: "Crawler access",
        ruleKeys: ["ROBOTS_DISALLOW_ALL", "ROBOTS_HOMEPAGE_BLOCKED", "ROBOTS_RESOURCE_BLOCKED"],
      },
      { key: "syntax", label: "File syntax", ruleKeys: ["ROBOTS_SYNTAX_ERROR"] },
      { key: "ai_crawlers", label: "AI crawlers", ruleKeys: ["ROBOTS_AI_CRAWLER_CUSTOM_RULES"] },
    ],
  },

  // ─── Stage 3A ────────────────────────────────────────────────────────────
  // Three more issue-backed modules. The topic vocabulary works exactly as it
  // does above; what makes these three different is that each ALSO has richer
  // non-issue data (Lighthouse audits, GEO/AEO/AIO readiness, Trust signals)
  // that leads its Overview — see each module's own `page.tsx`.

  pagespeed: {
    key: "pagespeed",
    slug: "pagespeed",
    label: "PageSpeed",
    description:
      "Google Lighthouse lab measurements for this site, plus the page-level performance findings recorded against crawled pages.",
    topics: [
      {
        key: "core_web_vitals",
        label: "Core Web Vitals",
        ruleKeys: ["PAGESPEED_CWV_LCP_FAIL", "PAGESPEED_CWV_CLS_FAIL", "PAGESPEED_CWV_INP_FAIL"],
      },
      {
        key: "overall_score",
        label: "Overall score",
        ruleKeys: ["PAGESPEED_POOR_PERFORMANCE_SCORE"],
      },
      {
        key: "render_path",
        label: "Render path & LCP",
        ruleKeys: [
          "PAGESPEED_RENDER_BLOCKING_RESOURCES",
          "PAGESPEED_LCP_ELEMENT_IDENTIFIED",
          "PAGESPEED_LCP_LAZY_LOADED",
        ],
      },
      {
        key: "layout_stability",
        label: "Layout stability",
        ruleKeys: ["PAGESPEED_CLS_ELEMENTS_IDENTIFIED"],
      },
      {
        key: "javascript",
        label: "JavaScript & main thread",
        ruleKeys: [
          "PAGESPEED_LONG_TASKS",
          "PAGESPEED_MAINTHREAD_WORK_HIGH",
          "PAGESPEED_JS_BOOTUP_HIGH",
          "PAGESPEED_JS_UNUSED",
          "PAGESPEED_JS_UNMINIFIED",
        ],
      },
      {
        key: "css",
        label: "CSS payload",
        ruleKeys: ["PAGESPEED_CSS_UNUSED", "PAGESPEED_CSS_UNMINIFIED"],
      },
      { key: "fonts", label: "Fonts", ruleKeys: ["PAGESPEED_FONT_DISPLAY_MISSING"] },
    ],
  },

  ai_search: {
    key: "ai_search",
    // NOT `ai-search`: the sidebar route has always been `ai-overview` and
    // that URL stays. `slug` must equal the `nav.ts` slug — see the field's
    // own note above — so the route the user already has keeps working.
    slug: "ai-overview",
    label: "AI Search Intelligence",
    description:
      "How readable, quotable and structurally answerable this site is for generative engines — GEO/AEO/AI Overview readiness, llms.txt, and what robots.txt tells named AI crawlers.",
    topics: [
      {
        key: "answer_structure",
        label: "Answer structure (AEO)",
        ruleKeys: [
          "AEO_NO_HEADING_QUESTIONS",
          "AEO_NO_FAQ_STRUCTURE",
          "AEO_NO_LISTS_OR_TABLES",
          "AEO_NO_STRUCTURED_DATA",
        ],
      },
      {
        key: "generative_readiness",
        label: "Generative readiness (GEO)",
        ruleKeys: ["GEO_NO_ENTITY_SCHEMA", "GEO_NO_CITATION_LINKS", "GEO_LOW_CONTENT_CHUNKABILITY"],
      },
      {
        key: "ai_crawler_access",
        label: "AI crawler access",
        ruleKeys: ["AI_CRAWLER_BLOCKED", "AI_CRAWLER_PARTIALLY_BLOCKED"],
      },
      {
        key: "llms_txt",
        label: "llms.txt",
        ruleKeys: [
          "LLMS_TXT_MISSING",
          "LLMS_TXT_HTTP_ERROR",
          "LLMS_TXT_MISSING_H1_TITLE",
          "LLMS_TXT_EMPTY_SECTION",
          "LLMS_TXT_INVALID_LINK_URL",
          "LLMS_TXT_DUPLICATE_LINK",
          "LLMS_TXT_OFF_DOMAIN_LINK",
          "LLMS_TXT_TOO_LARGE",
        ],
      },
      {
        key: "llms_full_txt",
        label: "llms-full.txt",
        ruleKeys: [
          "LLMS_FULL_TXT_WITHOUT_LLMS_TXT",
          "LLMS_FULL_TXT_HTTP_ERROR",
          "LLMS_FULL_TXT_EXCESSIVE_DUPLICATION",
        ],
      },
    ],
  },

  eeat: {
    key: "eeat",
    slug: "eeat",
    label: "E-E-A-T / Trust",
    description:
      "Observable markers commonly associated with Google's public E-E-A-T guidance — About/Contact/Privacy pages, HTTPS, and on-page authorship. Not a measurement of any Google ranking signal.",
    topics: [
      {
        key: "trust_pages",
        label: "Trust pages",
        ruleKeys: ["EEAT_NO_ABOUT_PAGE", "EEAT_NO_CONTACT_PAGE", "EEAT_NO_PRIVACY_PAGE"],
      },
      { key: "authorship", label: "Authorship", ruleKeys: ["EEAT_NO_AUTHOR_BYLINE"] },
    ],
  },
};

export const MODULE_KEYS = Object.keys(MODULE_DEFINITIONS) as ModuleKey[];

/** Route segment → definition. Used by the shared route glue and by tests. */
export function moduleBySlug(slug: string): ModuleDefinition | undefined {
  return MODULE_KEYS.map((key) => MODULE_DEFINITIONS[key]).find((definition) => definition.slug === slug);
}

/**
 * Topic key for one rule inside one module.
 *
 * Returns `OTHER_TOPIC_KEY` for any rule the module's vocabulary does not
 * name — including a rule from a different module, which cannot appear in
 * practice because `computeWebsiteModuleReport` has already filtered by
 * prefix, but must still resolve to something honest rather than throwing.
 */
export function topicForRuleKey(moduleKey: ModuleKey, ruleKey: string): string {
  for (const topic of MODULE_DEFINITIONS[moduleKey].topics) {
    if (topic.ruleKeys.includes(ruleKey)) return topic.key;
  }
  return OTHER_TOPIC_KEY;
}

/** Display label for a topic key, including the `other` bucket. */
export function topicLabel(moduleKey: ModuleKey, topicKey: string): string {
  if (topicKey === OTHER_TOPIC_KEY) return OTHER_TOPIC_LABEL;
  return MODULE_DEFINITIONS[moduleKey].topics.find((topic) => topic.key === topicKey)?.label ?? topicKey;
}

/** The tab bar every module report shares. */
export function moduleReportTabs(websiteId: string, moduleKey: ModuleKey, issueCount: number) {
  const base = `/websites/${websiteId}/${MODULE_DEFINITIONS[moduleKey].slug}`;
  return [
    { label: "Overview", href: base },
    { label: "Issues", href: `${base}/issues`, count: issueCount },
  ];
}
