import type { RuleDefinition } from "./rules-registry";

/**
 * E-E-A-T / Trust rules (Phase 25). Every rule flags an observable
 * trust/credibility markup signal the platform did or did not find — never
 * a claim about Google's actual internal E-E-A-T ranking signal (master doc
 * Section 79 #5). All `info` severity: these are readiness/best-practice
 * opportunities, not correctness defects, same discipline as Phase 24's
 * `AI_SEARCH_RULES`.
 */
export const EEAT_RULES: RuleDefinition[] = [
  {
    ruleKey: "EEAT_NO_AUTHOR_BYLINE",
    category: "eeat",
    severity: "info",
    title: "No author/date signal found on a content-heavy page",
    description:
      "This page has substantial body content but shows none of the observable authorship markers this platform checks for: a visible byline, a rel=\"author\" link, an author property on Article-family structured data, or a visible publish/modified date.",
    recommendation:
      "Where the page is article/blog-style content, add a visible byline (e.g. \"By [Name]\"), a rel=\"author\" link, and/or an author property on its Article/BlogPosting schema, plus a visible published or last-updated date.",
    impact:
      "Author and date signals are markers commonly associated with the Expertise/Trust elements of Google's public E-E-A-T guidance — this platform checks for their presence, not their accuracy, and does not measure Google's actual internal ranking signal.",
  },
  {
    ruleKey: "EEAT_NO_ABOUT_PAGE",
    category: "eeat",
    severity: "info",
    title: "No About page found",
    description:
      "None of the crawled pages match a common About-page URL or title pattern (e.g. /about, /about-us, a title containing \"About\").",
    recommendation:
      "Add a clearly-labeled About page describing who publishes this site and, where relevant, its team/organization.",
    impact:
      "An identifiable About page is a Trust/Authoritativeness marker in Google's public E-E-A-T guidance — this is a URL/title heuristic, not a guarantee the page is missing (an unconventionally-named About page would not be detected) or that an existing page's content is adequate.",
  },
  {
    ruleKey: "EEAT_NO_CONTACT_PAGE",
    category: "eeat",
    severity: "info",
    title: "No Contact page found",
    description:
      "None of the crawled pages match a common Contact-page URL or title pattern (e.g. /contact, /contact-us, a title containing \"Contact\").",
    recommendation:
      "Add a clearly-labeled Contact page with a way to reach the publisher (email, form, or, for a physical business, address/phone/ContactPage or LocalBusiness structured data).",
    impact:
      "A reachable Contact page is a Trust marker in Google's public E-E-A-T guidance — this is a URL/title heuristic, not a guarantee.",
  },
  {
    ruleKey: "EEAT_NO_PRIVACY_PAGE",
    category: "eeat",
    severity: "info",
    title: "No Privacy Policy page found",
    description:
      "None of the crawled pages match a common Privacy-Policy URL or title pattern (e.g. /privacy, /privacy-policy, a title containing \"Privacy\").",
    recommendation: "Add a Privacy Policy page describing what data is collected and how it is used.",
    impact:
      "A Privacy Policy is a Trust marker in Google's public E-E-A-T guidance (and often a legal requirement) — this is a URL/title heuristic, not a guarantee, and not legal advice.",
  },
];

export const EEAT_RULES_BY_KEY = new Map(EEAT_RULES.map((r) => [r.ruleKey, r]));
