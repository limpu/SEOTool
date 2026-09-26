import { ModuleIssuesRoute } from "../../_module-report/chrome";
import type { SearchParamsLike } from "@/components/report/filtering";

/** E-E-A-T / Trust → Issues tab. Rendering lives in the shared `ModuleIssuesRoute`. */
export default async function EeatIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  return <ModuleIssuesRoute moduleKey="eeat" websiteIdParam={id} searchParams={resolvedSearchParams} />;
}
