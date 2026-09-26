"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the Google Analytics report.
 *
 * Note what this boundary is NOT for: a Google API failure. Those are caught
 * inside the API route, returned as JSON, and rendered as an honest message
 * beside the "Load report" button — a stale Google token can never reach this
 * boundary, which is exactly why the report is fetched on click rather than
 * during the server render.
 */
export default function GoogleAnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ModuleReportError label="Google Analytics" error={error} reset={reset} />;
}
