import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { SEVERITY_LABELS } from "@/components/website/severity";
import { IssueSeverityBadge, SEVERITY_RULE_CLASS } from "./issue-severity-badge";
import { groupIssuesBySeverity, type ReportIssue } from "./filtering";

/**
 * The grouped-by-severity issue list shared by every report module.
 *
 * Rows arrive pre-resolved: the caller supplies each issue's `href` and its
 * human `categoryLabel`, so this component stays module-agnostic and needs no
 * knowledge of any module's routes or category vocabulary.
 *
 * The whole row is ONE link. A row containing a title link plus a separate
 * "View affected URLs" link would give a keyboard user two stops to the same
 * destination and would make the large, obvious click target inert. The
 * trailing affordance is therefore text inside the same link, not a second
 * one.
 */
export interface IssueListRow extends ReportIssue {
  /** Destination for the drill-down (the module's issue-detail route). */
  href: string;
  /** Display name for `category` — the caller owns that vocabulary. */
  categoryLabel: string;
}

export function IssueList({
  issues,
  actionLabel = "View affected URLs",
  headingLevel = "h2",
  /** When set, only the first N rows render (the Overview tab's preview). Grouping still applies. */
  limit,
}: {
  issues: IssueListRow[];
  actionLabel?: string;
  headingLevel?: "h2" | "h3";
  limit?: number;
}) {
  const visible = limit === undefined ? issues : issues.slice(0, limit);
  const groups = groupIssuesBySeverity(visible);
  const Heading = headingLevel;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.severity} aria-labelledby={`issue-group-${group.severity}`}>
          {/* The heading states the severity in WORDS; the rule below it only
              reinforces that in colour. No badge here — every row already
              carries one, and repeating it in the header is noise. */}
          <Heading id={`issue-group-${group.severity}`} className="text-sm font-semibold text-foreground">
            {SEVERITY_LABELS[group.severity]}{" "}
            <span className="tabular font-normal text-muted">({group.issues.length.toLocaleString("en-US")})</span>
          </Heading>
          {/* Coloured rule under the header. Decorative — the heading and badge already say the severity in words. */}
          <div className={`mt-1.5 h-0.5 w-full rounded-full ${SEVERITY_RULE_CLASS[group.severity]}`} aria-hidden="true" />

          <ul className="mt-2 divide-y divide-default rounded-lg border border-default">
            {group.issues.map((issue) => (
              <li key={issue.ruleKey}>
                <Link
                  href={issue.href}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <IssueSeverityBadge severity={issue.severity} className="shrink-0" />

                  <span className="min-w-0 flex-1 basis-full text-sm font-semibold text-foreground sm:basis-auto">
                    {issue.title}
                  </span>

                  <span className="tabular shrink-0 text-xs text-secondary-foreground">
                    {issue.affectedPageCount.toLocaleString("en-US")}{" "}
                    {issue.affectedPageCount === 1 ? "page" : "pages"}
                  </span>

                  <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                    {issue.categoryLabel}
                  </span>

                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-accent">
                    {actionLabel}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
