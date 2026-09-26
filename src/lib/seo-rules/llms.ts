import type { RuleViolation } from "./on-page";
import type { LlmsFileResult } from "@/lib/crawler/llms-analysis";

const MAX_REASONABLE_BYTES = 100 * 1024; // 100KB

/**
 * Evaluates llms.txt / llms-full.txt issues (Phase 18): existence, HTTP
 * status, markdown structure, link validity/duplication, off-domain links,
 * size, and the two-file consistency checks from the master doc's Section
 * 40/41 audit list. A missing llms.txt is deliberately `info`-severity, not
 * an error — per Section 79, it's an emerging convention, not a mandatory
 * ranking file.
 */
export function evaluateLlmsIssues(
  llmsTxt: LlmsFileResult,
  llmsFullTxt: LlmsFileResult,
  siteHostname: string
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!llmsTxt.found) {
    if (llmsTxt.httpStatus !== null && llmsTxt.httpStatus !== 404) {
      violations.push({
        ruleKey: "LLMS_TXT_HTTP_ERROR",
        evidence: `/llms.txt returned HTTP ${llmsTxt.httpStatus}.`,
      });
    } else {
      violations.push({
        ruleKey: "LLMS_TXT_MISSING",
        evidence: "No /llms.txt file was found at the site root.",
      });
    }
  } else {
    violations.push(...evaluateOneFile(llmsTxt, siteHostname, "LLMS_TXT"));
  }

  if (llmsFullTxt.found) {
    if (!llmsTxt.found) {
      violations.push({
        ruleKey: "LLMS_FULL_TXT_WITHOUT_LLMS_TXT",
        evidence: "/llms-full.txt exists but /llms.txt does not.",
      });
    }

    // Excessive-duplication check: same link URL set, no additions.
    if (llmsTxt.found && llmsTxt.parsed && llmsFullTxt.parsed) {
      const baseUrls = new Set(collectLinks(llmsTxt.parsed).map((l) => l.url));
      const fullUrls = new Set(collectLinks(llmsFullTxt.parsed).map((l) => l.url));
      const hasNewUrls = Array.from(fullUrls).some((u) => !baseUrls.has(u));
      if (baseUrls.size > 0 && fullUrls.size > 0 && !hasNewUrls) {
        violations.push({
          ruleKey: "LLMS_FULL_TXT_EXCESSIVE_DUPLICATION",
          evidence: "llms-full.txt's links are identical to llms.txt's, with no additional links.",
        });
      }
    }
  } else if (llmsFullTxt.httpStatus !== null && llmsFullTxt.httpStatus !== 404) {
    violations.push({
      ruleKey: "LLMS_FULL_TXT_HTTP_ERROR",
      evidence: `/llms-full.txt returned HTTP ${llmsFullTxt.httpStatus}.`,
    });
  }

  return violations;
}

function collectLinks(parsed: NonNullable<LlmsFileResult["parsed"]>) {
  return [...parsed.looseLinks, ...parsed.sections.flatMap((s) => s.links)];
}

function evaluateOneFile(
  file: LlmsFileResult,
  siteHostname: string,
  prefix: "LLMS_TXT"
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const parsed = file.parsed;
  if (!parsed) return violations;

  if (!parsed.title) {
    violations.push({
      ruleKey: `${prefix}_MISSING_H1_TITLE`,
      evidence: `${file.url} has no top-level "# Title" heading.`,
    });
  }

  for (const section of parsed.sections) {
    if (section.links.length === 0) {
      violations.push({
        ruleKey: `${prefix}_EMPTY_SECTION`,
        evidence: `Section "${section.heading}" has no links.`,
      });
    }
  }

  const allLinks = collectLinks(parsed);
  const invalidLinks = allLinks.filter((l) => !l.isValidUrl);
  if (invalidLinks.length > 0) {
    violations.push({
      ruleKey: `${prefix}_INVALID_LINK_URL`,
      evidence: `${invalidLinks.length} link(s) don't resolve to a valid absolute URL, e.g. "${invalidLinks[0].url}".`,
    });
  }

  const validLinks = allLinks.filter((l) => l.isValidUrl);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const l of validLinks) {
    if (seen.has(l.url)) duplicates.add(l.url);
    seen.add(l.url);
  }
  if (duplicates.size > 0) {
    violations.push({
      ruleKey: `${prefix}_DUPLICATE_LINK`,
      evidence: `${duplicates.size} URL(s) listed more than once, e.g. "${Array.from(duplicates)[0]}".`,
    });
  }

  const offDomain = validLinks.filter((l) => {
    try {
      return new URL(l.url).hostname !== siteHostname;
    } catch {
      return false;
    }
  });
  if (offDomain.length > 0) {
    violations.push({
      ruleKey: `${prefix}_OFF_DOMAIN_LINK`,
      evidence: `${offDomain.length} link(s) point to a domain other than ${siteHostname}, e.g. "${offDomain[0].url}".`,
    });
  }

  if (file.sizeBytes !== null && file.sizeBytes > MAX_REASONABLE_BYTES) {
    violations.push({
      ruleKey: `${prefix}_TOO_LARGE`,
      evidence: `File is ${Math.round(file.sizeBytes / 1024)}KB, over the ${Math.round(MAX_REASONABLE_BYTES / 1024)}KB heuristic threshold.`,
    });
  }

  return violations;
}
