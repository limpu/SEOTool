import { ModuleIssueDetailRoute } from "../../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/**
 * E-E-A-T / Trust → Issues → one issue, plus its affected URLs.
 * `ruleKey` is validated against this module's real rule set inside
 * `ModuleIssueDetailRoute`, which `notFound()`s on an unknown key — including
 * a key that belongs to a different module.
 */
export default async function EeatIssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; ruleKey: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id, ruleKey }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return (
    <ModuleIssueDetailRoute
      moduleKey="eeat"
      websiteIdParam={id}
      ruleKeyParam={ruleKey}
      searchParams={resolvedSearchParams}
    />
  );
}
