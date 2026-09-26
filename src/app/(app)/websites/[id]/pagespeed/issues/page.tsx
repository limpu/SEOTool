import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** PageSpeed → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function PageSpeedIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="pagespeed" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
