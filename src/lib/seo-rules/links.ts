export interface PageIssueRef {
  pageId: string;
  ruleKey: string;
  evidence: string;
}

export interface LinkRef {
  pageId: string;
  targetUrl: string;
  anchorText: string | null;
  isInternal: boolean;
}

/** Generic phrases that carry no information about the link's destination. */
const WEAK_ANCHOR_PHRASES = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "this",
  "this page",
  "this link",
  "link",
  "click",
  "more info",
  "more information",
  "details",
  "see more",
  "continue reading",
  "go",
]);

export function isWeakAnchorText(text: string): boolean {
  return WEAK_ANCHOR_PHRASES.has(text.trim().toLowerCase());
}

export interface LinkStatus {
  /** null when the target couldn't be resolved at all (network/DNS/timeout failure). */
  statusCode: number | null;
  /** Redirect hops observed for this specific target; -1 when not checked (unknown). */
  redirectCount: number;
}

/**
 * Evaluates weak-anchor-text and broken/redirecting-link issues, given a
 * lookup of already-known statuses for link targets (from pages crawled in
 * this run, or from a live link-check — see run-crawl.ts for how that map
 * is built; this function itself does no I/O).
 */
export function evaluateLinkIssues(
  links: LinkRef[],
  statusByUrl: Map<string, LinkStatus>
): PageIssueRef[] {
  const issues: PageIssueRef[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (link.anchorText && isWeakAnchorText(link.anchorText)) {
      const dedupeKey = `${link.pageId}:weak:${link.anchorText.trim().toLowerCase()}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        issues.push({
          pageId: link.pageId,
          ruleKey: "LINK_WEAK_ANCHOR_TEXT",
          evidence: `Anchor text: "${link.anchorText}"`,
        });
      }
    }

    const status = statusByUrl.get(link.targetUrl);
    if (!status) continue;

    const dedupeKeyBase = `${link.pageId}:${link.targetUrl}`;

    if (status.statusCode === null || status.statusCode >= 400) {
      const key = `${dedupeKeyBase}:broken`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          pageId: link.pageId,
          ruleKey: link.isInternal ? "LINK_BROKEN_INTERNAL" : "LINK_BROKEN_EXTERNAL",
          evidence:
            status.statusCode === null
              ? `${link.targetUrl} could not be reached.`
              : `${link.targetUrl} returned HTTP ${status.statusCode}.`,
        });
      }
      continue; // a broken link isn't also meaningfully "redirecting"
    }

    if (status.redirectCount > 0) {
      const key = `${dedupeKeyBase}:redirect`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          pageId: link.pageId,
          ruleKey: link.isInternal ? "LINK_REDIRECT_INTERNAL" : "LINK_REDIRECT_EXTERNAL",
          evidence: `${link.targetUrl} redirects (${status.redirectCount} hop(s)) before reaching final content.`,
        });
      }
    }
  }

  return issues;
}
