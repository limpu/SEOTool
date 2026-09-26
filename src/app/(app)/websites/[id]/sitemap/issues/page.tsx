import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** Sitemap → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function SitemapIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="sitemap" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
