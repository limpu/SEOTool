"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the Keywords / SERP report. Reuses the shared
 * `ModuleReportError` body so a failed load is reported AS a failure — never
 * as "No keywords tracked yet", which is a completely different fact and one
 * a user would act on.
 */
export default function KeywordsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleReportError label="Keywords / SERP" error={error} reset={reset} />;
}
