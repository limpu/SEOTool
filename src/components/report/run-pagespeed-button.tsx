"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Stage 3A — the ONE interactive capability the retired `PageSpeedPanel` had
 * that a Server Component cannot provide: starting a Lighthouse run and
 * noticing when it finishes.
 *
 * Everything else the old panel did (category scores, Core Web Vitals,
 * supporting metrics, resource-level diagnostics, batch history) is now
 * server-rendered from the same rows, so this leaf is deliberately tiny: it
 * POSTs, then polls ONLY the cheap status endpoint until no run is active and
 * calls `router.refresh()` so the server re-renders the real numbers. It never
 * holds a copy of the audit data, so there is no second rendering of a score
 * that could drift from the server's.
 *
 * Polling stops as soon as nothing is active, and on unmount.
 */

const ACTIVE_STATUSES = new Set(["pending", "running"]);
const POLL_INTERVAL_MS = 3000;

interface AuditStatusRow {
  status?: string;
}
interface BatchStatusRow {
  audits?: AuditStatusRow[];
}

export function RunPageSpeedButton({
  websiteId,
  initialActive,
  hasEverRun,
}: {
  websiteId: string;
  /** True when the server already saw a pending/running audit for this site. */
  initialActive: boolean;
  hasEverRun: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The server is the source of truth: if a refresh says a run is active (or
  // no longer is), follow it rather than keeping stale local state.
  useEffect(() => {
    setActive(initialActive);
  }, [initialActive]);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/websites/${websiteId}/pagespeed`);
      if (!res.ok) return;
      const body = (await res.json()) as { batches?: BatchStatusRow[] };
      const stillActive = (body.batches ?? []).some((batch) =>
        (batch.audits ?? []).some((audit) => ACTIVE_STATUSES.has(audit.status ?? ""))
      );
      if (!stillActive) {
        setActive(false);
        // Pull the finished audit's real numbers from the server.
        router.refresh();
      }
    } catch {
      // A transient network failure is not a finished run — keep polling
      // rather than reporting a completion nobody observed.
    }
  }, [websiteId, router]);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [active, checkStatus]);

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/pagespeed`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not start the PageSpeed audit.");
        return;
      }
      setActive(true);
      router.refresh();
    } catch {
      setError("Could not start the PageSpeed audit.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleStart} loading={starting || active} disabled={active}>
        <Gauge className="h-4 w-4" aria-hidden="true" />
        {active ? "Audit in progress…" : hasEverRun ? "Run a new audit" : "Run the first audit"}
      </Button>
      {active && (
        <p className="text-xs text-muted" role="status">
          Lighthouse is running against this site on mobile and desktop. This can take up to a minute per strategy;
          the results appear here on their own.
        </p>
      )}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
