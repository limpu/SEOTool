import type { RuleDefinition } from "./rules-registry";

/**
 * Phase 20 rules. Deliberately narrow — only "Lighthouse Performance score
 * is poor" and "a Core Web Vital fails Google's own published threshold."
 * The deep per-cause diagnostics (which image/script/font is responsible,
 * resource-level breakdowns) are explicitly Phase 21's job (Performance
 * Diagnostics); Phase 20 only runs Lighthouse and reports what it measured.
 * Per Section 79 ("proprietary scores are not Google metrics"), the poor-
 * score rule is worded as a heuristic threshold this product chose, not an
 * official Google ranking cutoff — the CWV rules use Google's own publicly
 * documented "Good" thresholds (LCP ≤2.5s, CLS ≤0.1, INP ≤200ms), which is
 * a different, citable class of fact.
 */
export const PAGESPEED_RULES: RuleDefinition[] = [
  {
    ruleKey: "PAGESPEED_POOR_PERFORMANCE_SCORE",
    category: "performance",
    severity: "high",
    title: "Lighthouse Performance score is poor",
    description: "The Lighthouse Performance score for this page is below a poor-performance heuristic threshold.",
    recommendation:
      "Review the Lighthouse report's opportunities/diagnostics for this page. Phase 21 (Performance Diagnostics) will break this down into specific image/JS/CSS/font-level recommendations.",
    impact:
      "This is a proprietary heuristic threshold this product applies to Lighthouse's own Performance category score — it is not an official Google ranking cutoff.",
  },
  {
    ruleKey: "PAGESPEED_CWV_LCP_FAIL",
    category: "performance",
    severity: "high",
    title: "Largest Contentful Paint (LCP) exceeds Google's Good threshold",
    description: "The measured LCP for this page is above 2.5 seconds, Google's published 'Good' threshold.",
    recommendation:
      "Identify the LCP element and address its specific cause (image weight/format/lazy-loading, render-blocking CSS/fonts, or slow server response). Deep LCP diagnostics land in Phase 21.",
    impact: "LCP is one of Google's three Core Web Vitals and is a documented, publicly-stated ranking signal.",
  },
  {
    ruleKey: "PAGESPEED_CWV_CLS_FAIL",
    category: "performance",
    severity: "medium",
    title: "Cumulative Layout Shift (CLS) exceeds Google's Good threshold",
    description: "The measured CLS for this page is above 0.1, Google's published 'Good' threshold.",
    recommendation:
      "Common causes include images/embeds without reserved dimensions, injected content, web-font swapping, and dynamically-inserted elements above existing content. Deep CLS diagnostics land in Phase 21.",
    impact: "CLS is one of Google's three Core Web Vitals and is a documented, publicly-stated ranking signal.",
  },
  {
    ruleKey: "PAGESPEED_CWV_INP_FAIL",
    category: "performance",
    severity: "medium",
    title: "Interaction to Next Paint (INP) exceeds Google's Good threshold",
    description: "The measured INP for this page is above 200ms, Google's published 'Good' threshold.",
    recommendation:
      "Common causes include long JavaScript tasks, heavy event handlers, and main-thread blocking from third-party scripts. Deep INP diagnostics land in Phase 21.",
    impact:
      "INP is one of Google's three Core Web Vitals (replacing FID). Lighthouse's lab-mode INP audit is only available in some report configurations — when unmeasured, no verdict is reported rather than assuming pass or fail.",
  },
];

export const PAGESPEED_RULES_BY_KEY = new Map(PAGESPEED_RULES.map((r) => [r.ruleKey, r]));
