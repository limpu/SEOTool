"use client";

import { ModuleReportError } from "../_module-report/error-boundary";

/**
 * Error boundary for the Robots.txt report. The body is the shared
 * `ModuleReportError` — see `../_module-report/error-boundary.tsx` for why a
 * failed load must never be rendered as an empty result. That distinction
 * matters most in exactly this report, where "no findings" is a plausible
 * genuine outcome and a swallowed error would be indistinguishable from it.
 */
export default function RobotsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleReportError label="Robots.txt" error={error} reset={reset} />;
}
