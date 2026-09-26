"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/report/states";

/**
 * Error boundary for the Site Audit report.
 *
 * A failed load is reported AS a failure, not as an empty report: "we could
 * not read this" and "this site has no issues" are opposite facts, and a
 * broken query rendered as "No issues found" would be the single most
 * dangerous piece of fake data this product could show.
 *
 * `error.digest` is Next's server-side error id and is the only detail shown —
 * the raw message of a server error is not surfaced to the browser.
 */
export default function SiteAuditError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Site Audit report failed to load", error);
  }, [error]);

  return (
    <ErrorState
      title="Could not load the Site Audit report"
      description="The report data could not be read. This is a loading failure, not a result — it does not mean the site has no issues."
      detail={error.digest ? `Error reference: ${error.digest}` : undefined}
    >
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </ErrorState>
  );
}
