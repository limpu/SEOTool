/**
 * Static definitions for every on-page SEO rule (Phase 7). Each entry
 * follows the Rule Model in the master doc (Section 14): category,
 * severity, condition (encoded in the analyzer, not here), evidence
 * (produced per-violation by the analyzer), recommendation, fix example,
 * impact. `ensureSeoRules()` upserts these into the `seo_rules` table so
 * `seo_issues` rows always have a valid `rule_id` to reference.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface RuleDefinition {
  ruleKey: string;
  category: "on_page" | "technical" | "performance" | "schema" | "geo" | "aeo" | "eeat";
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  fixExample?: string;
  impact: string;
}

export const ON_PAGE_RULES: RuleDefinition[] = [
  // ─── Title ───────────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_TITLE_MISSING",
    category: "on_page",
    severity: "critical",
    title: "Missing title",
    description: "The page has no <title> element.",
    recommendation: "Add a unique, descriptive title element to the page.",
    fixExample: "<title>Example Page Title</title>",
    impact: "Titles are a primary on-page ranking and click-through signal.",
  },
  {
    ruleKey: "ONPAGE_TITLE_EMPTY",
    category: "on_page",
    severity: "critical",
    title: "Empty title",
    description: "The <title> element is present but empty.",
    recommendation: "Write a unique, descriptive title that summarizes the page.",
    fixExample: "<title>Example Page Title</title>",
    impact: "An empty title provides no context to search engines or users.",
  },
  {
    ruleKey: "ONPAGE_TITLE_TOO_SHORT",
    category: "on_page",
    severity: "medium",
    title: "Title is too short",
    description: "The title is under 30 characters, which may under-use available space.",
    recommendation: "Expand the title to more fully describe the page's content.",
    impact: "Short titles may fail to communicate enough context in search results.",
  },
  {
    ruleKey: "ONPAGE_TITLE_TOO_LONG",
    category: "on_page",
    severity: "low",
    title: "Title is too long",
    description: "The title exceeds 60 characters and may be truncated in search results.",
    recommendation: "Shorten the title to keep the important part visible in search results.",
    impact: "Search engines may truncate titles beyond ~60 characters.",
  },
  {
    ruleKey: "ONPAGE_TITLE_DUPLICATE",
    category: "on_page",
    severity: "high",
    title: "Duplicate title",
    description: "This title is identical to another crawled page's title.",
    recommendation: "Give each page a unique title reflecting its specific content.",
    impact: "Duplicate titles make it harder for search engines to differentiate pages.",
  },

  // ─── Meta Description ───────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_META_DESCRIPTION_MISSING",
    category: "on_page",
    severity: "medium",
    title: "Missing meta description",
    description: "The page has no meta description tag.",
    recommendation: "Add a concise, unique meta description summarizing the page.",
    fixExample: '<meta name="description" content="A concise page summary.">',
    impact: "Meta descriptions influence the snippet shown in search results.",
  },
  {
    ruleKey: "ONPAGE_META_DESCRIPTION_EMPTY",
    category: "on_page",
    severity: "medium",
    title: "Empty meta description",
    description: "The meta description tag is present but has no content.",
    recommendation: "Write a concise, unique meta description summarizing the page.",
    impact: "An empty description leaves search engines to auto-generate a snippet.",
  },
  {
    ruleKey: "ONPAGE_META_DESCRIPTION_TOO_SHORT",
    category: "on_page",
    severity: "low",
    title: "Meta description is too short",
    description: "The meta description is under 50 characters.",
    recommendation: "Expand the description to better summarize the page's content.",
    impact: "Very short descriptions under-use the space search engines display.",
  },
  {
    ruleKey: "ONPAGE_META_DESCRIPTION_TOO_LONG",
    category: "on_page",
    severity: "low",
    title: "Meta description is too long",
    description: "The meta description exceeds 160 characters and may be truncated.",
    recommendation: "Shorten the description to keep the key message visible.",
    impact: "Search engines may truncate descriptions beyond ~160 characters.",
  },
  {
    ruleKey: "ONPAGE_META_DESCRIPTION_DUPLICATE",
    category: "on_page",
    severity: "medium",
    title: "Duplicate meta description",
    description: "This meta description is identical to another crawled page's description.",
    recommendation: "Write a unique description for each page.",
    impact: "Duplicate descriptions reduce differentiation in search results.",
  },

  // ─── Headings ────────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_H1_MISSING",
    category: "on_page",
    severity: "high",
    title: "Missing H1",
    description: "The page has no H1 heading.",
    recommendation: "Add a single H1 that clearly describes the page's main topic.",
    fixExample: "<h1>Main Page Heading</h1>",
    impact: "The H1 is a strong on-page relevance signal for both users and search engines.",
  },
  {
    ruleKey: "ONPAGE_H1_MULTIPLE",
    category: "on_page",
    severity: "medium",
    title: "Multiple H1 elements",
    description: "The page has more than one H1 heading.",
    recommendation: "Use a single H1 for the main heading; use H2+ for subsections.",
    impact: "Multiple H1s can dilute the page's primary topic signal.",
  },
  {
    ruleKey: "ONPAGE_H1_EMPTY",
    category: "on_page",
    severity: "medium",
    title: "Empty H1",
    description: "An H1 element exists but contains no text.",
    recommendation: "Give the H1 meaningful text describing the page.",
    impact: "An empty H1 provides no topical signal.",
  },
  {
    ruleKey: "ONPAGE_HEADING_EMPTY",
    category: "on_page",
    severity: "low",
    title: "Empty heading",
    description: "A heading element (H2-H6) exists but contains no text.",
    recommendation: "Remove the empty heading or give it meaningful text.",
    impact: "Empty headings clutter the document outline without adding value.",
  },
  {
    ruleKey: "ONPAGE_HEADING_HIERARCHY_SKIP",
    category: "on_page",
    severity: "low",
    title: "Heading hierarchy skips a level",
    description: "A heading jumps more than one level deeper than the previous heading (e.g. H2 to H4).",
    recommendation: "Structure headings in order without skipping levels.",
    impact: "A broken heading hierarchy makes the document structure harder to parse.",
  },

  // ─── Canonical ───────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_CANONICAL_MISSING",
    category: "on_page",
    severity: "low",
    title: "Missing canonical tag",
    description: "The page has no canonical link element.",
    recommendation: "Add a self-referencing canonical tag unless intentionally omitted.",
    fixExample: '<link rel="canonical" href="https://example.com/page">',
    impact: "Canonical tags help search engines resolve duplicate/alternate URLs.",
  },
  {
    ruleKey: "ONPAGE_CANONICAL_CROSS_DOMAIN",
    category: "on_page",
    severity: "medium",
    title: "Canonical points to a different domain",
    description: "The canonical URL points to a different domain than the crawled site.",
    recommendation: "Verify this is intentional; otherwise point the canonical at this domain.",
    impact: "An unexpected cross-domain canonical can remove this page from indexing.",
  },

  // ─── Robots ──────────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_ROBOTS_NOINDEX",
    category: "on_page",
    severity: "info",
    title: "Page is set to noindex",
    description: "The robots meta tag includes noindex, excluding this page from search results.",
    recommendation: "Confirm this page is intentionally excluded from indexing.",
    impact: "Noindex pages will not appear in search results.",
  },

  // ─── Open Graph ──────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_OG_MISSING_TITLE",
    category: "on_page",
    severity: "low",
    title: "Missing og:title",
    description: "No Open Graph title tag was found.",
    recommendation: "Add an og:title tag for better link previews on social platforms.",
    fixExample: '<meta property="og:title" content="Page Title">',
    impact: "Missing og:title may cause an inconsistent social share preview.",
  },
  {
    ruleKey: "ONPAGE_OG_MISSING_DESCRIPTION",
    category: "on_page",
    severity: "low",
    title: "Missing og:description",
    description: "No Open Graph description tag was found.",
    recommendation: "Add an og:description tag summarizing the page for social shares.",
    impact: "Missing og:description may cause a blank or auto-generated share preview.",
  },
  {
    ruleKey: "ONPAGE_OG_MISSING_IMAGE",
    category: "on_page",
    severity: "low",
    title: "Missing og:image",
    description: "No Open Graph image tag was found.",
    recommendation: "Add an og:image tag so shared links display a preview image.",
    impact: "Links shared without og:image often show no preview image.",
  },

  // ─── Twitter/X ───────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_TWITTER_MISSING_CARD",
    category: "on_page",
    severity: "info",
    title: "Missing twitter:card",
    description: "No Twitter/X card tag was found.",
    recommendation: "Add a twitter:card tag to control how links preview on X/Twitter.",
    fixExample: '<meta name="twitter:card" content="summary_large_image">',
    impact: "Without twitter:card, X falls back to generic Open Graph rendering.",
  },

  // ─── Hreflang ────────────────────────────────────────────────────────────
  {
    ruleKey: "ONPAGE_HREFLANG_MISSING_SELF",
    category: "on_page",
    severity: "medium",
    title: "Hreflang set is missing a self-reference",
    description: "The page declares hreflang alternates but does not include a self-referencing entry.",
    recommendation: "Include a self-referencing hreflang entry alongside the alternates.",
    impact: "Missing self-reference is a common cause of hreflang being ignored.",
  },

  // ─── Images (basic — deeper analysis is Phase 10) ───────────────────────
  {
    ruleKey: "ONPAGE_IMAGE_MISSING_ALT",
    category: "on_page",
    severity: "medium",
    title: "Image missing alt text",
    description: "An image on this page has no alt attribute.",
    recommendation: "Add descriptive alt text, or alt=\"\" for purely decorative images.",
    fixExample: '<img src="photo.jpg" alt="Description of the photo">',
    impact: "Alt text supports accessibility and gives search engines image context.",
  },

  // ─── Links (basic — deeper analysis is Phase 9) ─────────────────────────
  {
    ruleKey: "ONPAGE_LINK_EMPTY_ANCHOR",
    category: "on_page",
    severity: "low",
    title: "Link has no anchor text",
    description: "A link on this page has no visible text content.",
    recommendation: "Add descriptive anchor text, or an aria-label for icon-only links.",
    impact: "Empty anchors provide no context to users or search engines.",
  },
];

export const ON_PAGE_RULES_BY_KEY = new Map(ON_PAGE_RULES.map((r) => [r.ruleKey, r]));
