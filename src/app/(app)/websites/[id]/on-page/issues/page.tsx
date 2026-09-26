import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** On-Page SEO → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function OnPageSeoIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="on_page" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
