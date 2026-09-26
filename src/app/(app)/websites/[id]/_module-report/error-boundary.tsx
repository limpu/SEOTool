"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/report/states";

/**
 * The shared error boundary body for all five module reports.
 *
 * A failed load is reported AS a failure, not as an empty report: "we could
 * not read this" and "this module found nothing" are opposite facts, and a
 * broken query rendered as "No issues found" would be the single most
 * dangerous piece of fake data this product could show — especially here,
 * where a clean Robots.txt or Sitemap report is a plausible real result.
 *
 * `error.digest` is Next's server-side error id and is the only detail
 * surfaced; the raw message of a server error never reaches the browser.
 */
export function ModuleReportError({
  label,
  error,
  reset,
}: {
  label: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`${label} report failed to load`, error);
  }, [label, error]);

  return (
    <ErrorState
      title={`Could not load the ${label} report`}
      description="The report data could not be read. This is a loading failure, not a result — it does not mean this site has no findings."
      detail={error.digest ? `Error reference: ${error.digest}` : undefined}
    >
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </ErrorState>
  );
}
