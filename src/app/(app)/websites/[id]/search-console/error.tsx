"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the Search Console report. A failed read must never be
 * rendered as "Connected, but no data synced yet" — that would report a broken
 * query as a working integration with nothing in it.
 */
export default function SearchConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleReportError label="Search Console" error={error} reset={reset} />;
}
