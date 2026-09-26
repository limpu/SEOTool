"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the Competitors report. "We could not read this" must
 * never render as "No competitors added yet" — that would report a broken
 * query as a user with no competitors.
 */
export default function CompetitorsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleReportError label="Competitors" error={error} reset={reset} />;
}
