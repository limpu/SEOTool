import type { RuleDefinition } from "./rules-registry";

/**
 * Phase 21 rules — Performance Diagnostics. Extends Phase 20's narrow
 * score/CWV-threshold rules (`pagespeed-rules-registry.ts`) with
 * resource-level, per-cause diagnostics built from the same Lighthouse
 * audits Phase 20 already runs (`src/lib/pagespeed/diagnostics.ts`
 * extracts them from `pagespeed_audits.rawResult`; no second Lighthouse
 * run, no paid API — see Section 79 rule #1).
 *
 * Every rule's evidence, produced by `diagnostics.ts`, cites the specific
 * named Lighthouse audit (e.g. "unused-javascript") and real numbers from
 * that audit's own `details.items` — never a generic or invented claim,
 * per Section 79 rule #3.
 */
export const PAGESPEED_DIAGNOSTICS_RULES: RuleDefinition[] = [
  // ─── LCP ──────────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_LCP_ELEMENT_IDENTIFIED",
    category: "performance",
    severity: "info",
    title: "LCP element identified",
    description: "Lighthouse identified the specific DOM element responsible for this page's Largest Contentful Paint.",
    recommendation:
      "Prioritize this exact element: ensure it isn't lazy-loaded, is served in an optimized format, and isn't delayed by render-blocking CSS/fonts/scripts.",
    impact: "Knowing the exact LCP element (rather than only the headline LCP time) makes optimization actionable.",
  },
  {
    ruleKey: "PAGESPEED_LCP_LAZY_LOADED",
    category: "performance",
    severity: "high",
    title: "LCP element is lazy-loaded",
    description: "Lighthouse's lcp-lazy-loaded audit failed: the Largest Contentful Paint element uses loading=\"lazy\", which delays its own render.",
    recommendation: "Remove loading=\"lazy\" from the LCP element (typically a hero image) and consider fetchpriority=\"high\" instead.",
    impact: "Lazy-loading the LCP element is a direct, well-documented cause of a slow LCP.",
  },
  // ─── CLS ──────────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_CLS_ELEMENTS_IDENTIFIED",
    category: "performance",
    severity: "medium",
    title: "Elements causing layout shift identified",
    description: "Lighthouse's layout-shift-elements audit identified specific DOM elements contributing to this page's Cumulative Layout Shift.",
    recommendation:
      "Reserve explicit width/height (or aspect-ratio) for images/embeds/ads, avoid inserting content above existing content, and avoid layout-affecting web-font swaps for the elements listed in the evidence.",
    impact: "CLS is one of Google's three Core Web Vitals; knowing the specific elements makes the fix targeted instead of guesswork.",
  },
  // ─── INP / TBT ──────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_LONG_TASKS",
    category: "performance",
    severity: "medium",
    title: "Long main-thread tasks detected",
    description: "Lighthouse's long-tasks audit found one or more JavaScript tasks blocking the main thread for an extended period.",
    recommendation: "Break up long tasks (code-split, defer non-critical JS, use requestIdleCallback/web workers) for the specific script named in the evidence.",
    impact: "Long tasks directly delay input responsiveness and are a primary contributor to a poor INP.",
  },
  {
    ruleKey: "PAGESPEED_MAINTHREAD_WORK_HIGH",
    category: "performance",
    severity: "medium",
    title: "High main-thread work",
    description: "Lighthouse's mainthread-work-breakdown audit scored this page's total main-thread work below a full pass.",
    recommendation: "Reduce the work in the largest contributing category named in the evidence (e.g. Script Evaluation, Style & Layout).",
    impact: "Main-thread work competes with user interactions for CPU time, directly affecting INP.",
  },
  // ─── JS ───────────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_JS_BOOTUP_HIGH",
    category: "performance",
    severity: "medium",
    title: "High JavaScript execution time",
    description: "Lighthouse's bootup-time audit scored this page's JS parse/compile/execute time below a full pass.",
    recommendation: "Reduce the payload or defer/split the specific script named in the evidence, which is the heaviest contributor.",
    impact: "JS execution time directly consumes main-thread time, delaying interactivity and hurting INP/TBT.",
  },
  {
    ruleKey: "PAGESPEED_JS_UNUSED",
    category: "performance",
    severity: "medium",
    title: "Unused JavaScript",
    description: "Lighthouse's unused-javascript audit found a script shipping substantially more code than the page actually executes.",
    recommendation: "Code-split or tree-shake the specific script named in the evidence; defer/remove unused code paths.",
    impact: "Unused JavaScript still costs download, parse, and (often) execution time, delaying FCP/LCP for no benefit.",
  },
  {
    ruleKey: "PAGESPEED_JS_UNMINIFIED",
    category: "performance",
    severity: "low",
    title: "Unminified JavaScript",
    description: "Lighthouse's unminified-javascript audit found a script that isn't minified.",
    recommendation: "Minify the specific script named in the evidence as part of the build/deploy pipeline.",
    impact: "Minification is a low-risk, mechanical transfer-size reduction with no functional downside.",
  },
  // ─── CSS ──────────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_CSS_UNUSED",
    category: "performance",
    severity: "low",
    title: "Unused CSS",
    description: "Lighthouse's unused-css-rules audit found a stylesheet shipping substantially more rules than the page actually uses.",
    recommendation: "Remove or defer unused rules from the specific stylesheet named in the evidence (e.g. via a CSS purge/tree-shake step).",
    impact: "Unused CSS increases transfer size and can delay first render while the browser parses it.",
  },
  {
    ruleKey: "PAGESPEED_CSS_UNMINIFIED",
    category: "performance",
    severity: "low",
    title: "Unminified CSS",
    description: "Lighthouse's unminified-css audit found a stylesheet that isn't minified.",
    recommendation: "Minify the specific stylesheet named in the evidence as part of the build/deploy pipeline.",
    impact: "Minification is a low-risk, mechanical transfer-size reduction with no functional downside.",
  },
  {
    ruleKey: "PAGESPEED_RENDER_BLOCKING_RESOURCES",
    category: "performance",
    severity: "medium",
    title: "Render-blocking resources",
    description: "Lighthouse's render-blocking-resources audit found resources delaying the page's first render.",
    recommendation: "Inline critical CSS, defer non-critical CSS/JS, or use async/defer script attributes for the specific resource named in the evidence.",
    impact: "Render-blocking resources delay FCP and LCP by holding up the browser's first paint.",
  },
  // ─── Fonts ────────────────────────────────────────────────────────────
  {
    ruleKey: "PAGESPEED_FONT_DISPLAY_MISSING",
    category: "performance",
    severity: "low",
    title: "Fonts missing a font-display strategy",
    description: "Lighthouse's font-display audit found one or more web fonts without a font-display strategy, risking invisible text while the font loads.",
    recommendation: "Add font-display: swap (or optional) to the @font-face rule(s) for the font(s) named in the evidence.",
    impact: "Without font-display, browsers may render invisible text during font load (FOIT), harming perceived load speed.",
  },
];

export const PAGESPEED_DIAGNOSTICS_RULES_BY_KEY = new Map(PAGESPEED_DIAGNOSTICS_RULES.map((r) => [r.ruleKey, r]));
