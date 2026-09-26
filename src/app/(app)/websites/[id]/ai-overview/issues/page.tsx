import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** AI Search Intelligence → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function AiSearchIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="ai_search" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
