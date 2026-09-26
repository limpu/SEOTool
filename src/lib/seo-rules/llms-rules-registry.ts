import type { RuleDefinition } from "./rules-registry";

/**
 * llms.txt / llms-full.txt rules (Phase 18). All `technical` category,
 * consistent with the other well-known-file checks (sitemap, robots.txt).
 * Per the master doc (Section 40) and Section 79 (Product Safety &
 * Integrity Rules): llms.txt is an emerging community convention, not an
 * official ranking requirement — a missing file is `info`, never an error,
 * and no rule here implies that publishing llms.txt guarantees any LLM
 * actually reads or respects it.
 */
export const LLMS_RULES: RuleDefinition[] = [
  {
    ruleKey: "LLMS_TXT_MISSING",
    category: "technical",
    severity: "info",
    title: "llms.txt not found",
    description: "No /llms.txt file was found at the site root.",
    recommendation:
      "Consider publishing an llms.txt file if the site's content strategy benefits from an explicit, machine-readable content guide for LLMs. This is an emerging convention/proposal, not an official Google ranking requirement.",
    impact: "llms.txt is optional; its absence has no known effect on traditional search ranking.",
  },
  {
    ruleKey: "LLMS_TXT_HTTP_ERROR",
    category: "technical",
    severity: "low",
    title: "llms.txt returned an HTTP error",
    description: "A /llms.txt request returned a non-2xx, non-404 status (e.g. 5xx or an unexpected redirect target).",
    recommendation: "Investigate why /llms.txt isn't serving cleanly — fix the route or hosting configuration.",
    impact: "An erroring llms.txt is indistinguishable from a broken file to any consumer trying to read it.",
  },
  {
    ruleKey: "LLMS_TXT_MISSING_H1_TITLE",
    category: "technical",
    severity: "low",
    title: "llms.txt has no H1 title",
    description: "The llms.txt content does not start with a top-level `# Title` heading, as the community convention expects.",
    recommendation: "Add a single `# Site Name` heading at the top of the file.",
    impact: "Without a title, the file's structure is harder for any consumer (human or machine) to parse reliably.",
  },
  {
    ruleKey: "LLMS_TXT_EMPTY_SECTION",
    category: "technical",
    severity: "low",
    title: "llms.txt has an empty section",
    description: "An `## Section` heading in llms.txt has no link list entries under it.",
    recommendation: "Remove the empty section heading or add links under it.",
    impact: "Empty sections add noise without adding value.",
  },
  {
    ruleKey: "LLMS_TXT_INVALID_LINK_URL",
    category: "technical",
    severity: "medium",
    title: "llms.txt lists an invalid link URL",
    description: "A link entry in llms.txt does not resolve to a valid absolute http/https URL.",
    recommendation: "Fix or remove the invalid link entry.",
    impact: "Invalid URLs can't be followed by any consumer of the file.",
  },
  {
    ruleKey: "LLMS_TXT_DUPLICATE_LINK",
    category: "technical",
    severity: "low",
    title: "llms.txt lists a duplicate link",
    description: "The same URL appears more than once across llms.txt's sections.",
    recommendation: "Remove duplicate link entries.",
    impact: "Duplicate entries add noise without adding value.",
  },
  {
    ruleKey: "LLMS_TXT_OFF_DOMAIN_LINK",
    category: "technical",
    severity: "info",
    title: "llms.txt links to an external domain",
    description: "One or more links in llms.txt point to a domain other than the site's own — this may be intentional (e.g. a docs subdomain or partner resource).",
    recommendation: "Confirm off-domain links are intentional.",
    impact: "Off-domain links aren't inherently wrong, but worth a deliberate check since llms.txt is meant to describe this site.",
  },
  {
    ruleKey: "LLMS_TXT_TOO_LARGE",
    category: "technical",
    severity: "low",
    title: "llms.txt is unusually large",
    description: "The llms.txt file is larger than a reasonable size for a curated link index (over 100KB).",
    recommendation: "Keep llms.txt focused on a curated set of important links; move exhaustive content into llms-full.txt instead.",
    impact: "An oversized llms.txt undermines its purpose as a concise, high-signal guide.",
  },
  {
    ruleKey: "LLMS_FULL_TXT_WITHOUT_LLMS_TXT",
    category: "technical",
    severity: "info",
    title: "llms-full.txt exists but llms.txt does not",
    description: "The site publishes /llms-full.txt but has no /llms.txt.",
    recommendation: "Per the convention, llms.txt is the primary, concise file; llms-full.txt is a supplementary expanded version. Consider adding llms.txt as well.",
    impact: "Consumers that only check the primary llms.txt location will miss this site's content guide entirely.",
  },
  {
    ruleKey: "LLMS_FULL_TXT_HTTP_ERROR",
    category: "technical",
    severity: "low",
    title: "llms-full.txt returned an HTTP error",
    description: "A /llms-full.txt request returned a non-2xx, non-404 status.",
    recommendation: "Investigate why /llms-full.txt isn't serving cleanly.",
    impact: "An erroring llms-full.txt is indistinguishable from a broken file to any consumer trying to read it.",
  },
  {
    ruleKey: "LLMS_FULL_TXT_EXCESSIVE_DUPLICATION",
    category: "technical",
    severity: "low",
    title: "llms-full.txt duplicates llms.txt without adding content",
    description: "llms-full.txt's link set is identical to llms.txt's, with no additional links.",
    recommendation: "llms-full.txt is meant to be an expanded version — add the fuller content set it implies, or remove the duplicate file.",
    impact: "A llms-full.txt that adds nothing over llms.txt doesn't serve its stated purpose.",
  },
];

export const LLMS_RULES_BY_KEY = new Map(LLMS_RULES.map((r) => [r.ruleKey, r]));
