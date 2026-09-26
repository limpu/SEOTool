"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the E-E-A-T / Trust report. The body is the shared
 * `ModuleReportError` — see `../_module-report/error-boundary.tsx` for why a
 * failed load must never be rendered as an empty result.
 */
export default function EeatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleReportError label="E-E-A-T / Trust" error={error} reset={reset} />;
}
