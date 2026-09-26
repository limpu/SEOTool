import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** Schema → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function SchemaIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="schema" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
