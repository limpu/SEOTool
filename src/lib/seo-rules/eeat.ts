import type { RuleViolation } from "./on-page";
import { findAboutPage, findContactPage, findPrivacyPage, hasArticleAuthorSchema, type CrawledPageRef } from "@/lib/eeat/detect";

/**
 * Phase 25 — E-E-A-T / Trust rule evaluation. Same evaluate-function pattern
 * as every prior rule registry (`evaluateSchemaIssues`, `evaluateAiSearchPageIssues`).
 * Gated to content-heavy pages so navigational/product-catalog pages (which
 * legitimately have no byline) aren't flagged.
 */
const MIN_WORD_COUNT_FOR_AUTHOR_RULE = 300;

export interface EeatPageInput {
  wordCount: number;
  hasAuthorByline: boolean;
  hasRelAuthorLink: boolean;
  hasVisibleDate: boolean;
  schemaTypes: { schemaType: string | null; hasAuthorProperty: boolean }[];
}

export function evaluateEeatPageIssues(input: EeatPageInput): RuleViolation[] {
  if (input.wordCount < MIN_WORD_COUNT_FOR_AUTHOR_RULE) return [];

  const articleAuthorSchema = hasArticleAuthorSchema(input.schemaTypes);
  const hasAnyAuthorSignal = input.hasAuthorByline || input.hasRelAuthorLink || articleAuthorSchema || input.hasVisibleDate;

  if (hasAnyAuthorSignal) return [];

  return [
    {
      ruleKey: "EEAT_NO_AUTHOR_BYLINE",
      evidence: `${input.wordCount}-word page with no visible byline, rel="author" link, Article-schema author property, or visible date.`,
    },
  ];
}

export interface EeatSiteInput {
  pages: CrawledPageRef[];
}

/** Site-level: fires once, attached to the homepage row, same pattern as `evaluateAiSearchSiteIssues`. */
export function evaluateEeatSiteIssues(input: EeatSiteInput): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const aboutPage = findAboutPage(input.pages);
  if (!aboutPage) {
    violations.push({
      ruleKey: "EEAT_NO_ABOUT_PAGE",
      evidence: `No page among ${input.pages.length} crawled matched a common About-page URL/title pattern.`,
    });
  }

  const contactPage = findContactPage(input.pages);
  if (!contactPage) {
    violations.push({
      ruleKey: "EEAT_NO_CONTACT_PAGE",
      evidence: `No page among ${input.pages.length} crawled matched a common Contact-page URL/title pattern.`,
    });
  }

  const privacyPage = findPrivacyPage(input.pages);
  if (!privacyPage) {
    violations.push({
      ruleKey: "EEAT_NO_PRIVACY_PAGE",
      evidence: `No page among ${input.pages.length} crawled matched a common Privacy-Policy URL/title pattern.`,
    });
  }

  return violations;
}
