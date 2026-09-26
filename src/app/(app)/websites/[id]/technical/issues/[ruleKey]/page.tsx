import { ModuleIssueDetailRoute } from "../../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/**
 * Technical SEO → Issues → one issue, plus its affected URLs.
 * `ruleKey` is validated against this module's real rule set inside
 * `ModuleIssueDetailRoute`, which `notFound()`s on an unknown key.
 */
export default async function TechnicalSeoIssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; ruleKey: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id, ruleKey }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return (
    <ModuleIssueDetailRoute
      moduleKey="technical"
      websiteIdParam={id}
      ruleKeyParam={ruleKey}
      searchParams={resolvedSearchParams}
    />
  );
}
