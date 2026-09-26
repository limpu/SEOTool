"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the PageSpeed report. The body is the shared
 * `ModuleReportError` — see `../_module-report/error-boundary.tsx` for why a
 * failed load must never be rendered as an empty result.
 */
export default function PageSpeedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleReportError label="PageSpeed" error={error} reset={reset} />;
}
