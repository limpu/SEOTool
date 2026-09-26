import { notFound } from "next/navigation";

import { requireWorkspacePage } from "@/lib/website-workspace/guard";
import { UpgradeRequired } from "@/components/website/upgrade-required";
import { ReportIssueDetailPage } from "@/components/report/issue-detail-page";
import type { SearchParamsLike } from "@/components/report/filtering";

import { categoryLabel, loadSiteAuditData } from "../../data";

/**
 * Site Audit → Issues → one issue.
 *
 * Stage 2 note: the body is now the shared `ReportIssueDetailPage` (Stage 1's
 * implementation, lifted and parameterised). Validation deliberately stayed
 * HERE, in the route segment: `ruleKey` arrives from the URL and is checked
 * against the site's real rule set before anything renders, so an unknown key
 * — or one whose rule has since been fixed — produces a real HTTP 404 rather
 * than a "not found" body served with a 200.
 */
export default async function SiteAuditIssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; ruleKey: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const { id, ruleKey } = await params;
  const { site, access } = await requireWorkspacePage(id, "site-audit");
  if (!access.entitled) return <UpgradeRequired label="Site Audit" />;

  const [data, resolvedSearchParams] = await Promise.all([loadSiteAuditData(site.id), searchParams]);

  const decodedRuleKey = decodeURIComponent(ruleKey);
  const issue = data.issues.find((entry) => entry.ruleKey === decodedRuleKey);
  if (!issue) notFound();

  return (
    <ReportIssueDetailPage
      issue={issue}
      issuesPath={`/websites/${site.id}/site-audit/issues`}
      categoryLabel={categoryLabel}
      searchParams={resolvedSearchParams}
    />
  );
}
