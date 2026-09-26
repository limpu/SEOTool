"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Stage 3B — the WRITE actions carried over from the retired
 * `CompetitorPanel`, plus its Phase 29 AI content-gap block.
 *
 * Every mutation the panel owned survives against the SAME API routes:
 *   • Add competitor        → `POST   /api/websites/[id]/competitors`
 *   • Remove competitor     → `DELETE /api/websites/[id]/competitors/[cid]`
 *   • Crawl competitor      → `POST   /api/websites/[id]/competitors/[cid]/crawl`
 *   • Run content-gap AI    → `POST   …/content-gap`
 *
 * Polling is kept exactly where the panel had it and nowhere else: a crawl and
 * an AI analysis are genuinely asynchronous background jobs, so their status
 * has to be watched. When a job reaches a terminal state the poll stops AND
 * `router.refresh()` re-renders the server component, so the freshly-crawled
 * numbers arrive from the database rather than from a second client-side copy.
 */

const ACTIVE_CRAWL_STATUSES = new Set(["pending", "running"]);

export function AddCompetitorForm({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to add competitor.");
      setName("");
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add competitor.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="comp-name" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Competitor name
          </label>
          <Input id="comp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Corp" />
        </div>
        <div>
          <label htmlFor="comp-url" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Competitor website URL
          </label>
          <Input
            id="comp-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://competitor.com"
          />
        </div>
      </div>
      <Button type="submit" variant="primary" loading={submitting}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {submitting ? "Adding…" : "Add competitor"}
      </Button>
    </form>
  );
}

export function RemoveCompetitorButton({
  websiteId,
  competitorId,
  name,
  redirectTo,
}: {
  websiteId: string;
  competitorId: string;
  name: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove competitor "${name}" and all of its crawl data?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors/${competitorId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove competitor.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove competitor.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" onClick={remove} loading={busy}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Remove
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/**
 * Start a competitor crawl and watch it finish.
 *
 * `initialStatus` comes from the SERVER render, so the button is already in
 * the right state on first paint — a crawl that is running when the page loads
 * shows as running without a client round trip first.
 */
export function CrawlCompetitorButton({
  websiteId,
  competitorId,
  initialStatus,
}: {
  websiteId: string;
  competitorId: string;
  initialStatus: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors/${competitorId}/crawl-runs`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const latest = body.crawlRuns?.[0];
      const next = latest?.status ?? null;
      setStatus(next);
      if (next && !ACTIVE_CRAWL_STATUSES.has(next)) {
        // Terminal state — stop polling and let the server re-render the real
        // numbers rather than holding a second copy here.
        router.refresh();
      }
    } catch {
      // A transient poll failure is not a crawl failure — stay quiet and retry.
    }
  }, [websiteId, competitorId, router]);

  useEffect(() => {
    const active = status !== null && ACTIVE_CRAWL_STATUSES.has(status);
    if (active && !pollRef.current) {
      pollRef.current = setInterval(poll, 2000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [status, poll]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors/${competitorId}/crawl`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to start crawl.");
      setStatus("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start crawl.");
    } finally {
      setStarting(false);
    }
  }

  const busy = status !== null && ACTIVE_CRAWL_STATUSES.has(status);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" loading={starting || busy} onClick={start}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {busy ? "Crawling…" : "Crawl competitor"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

interface GapItem {
  topic: string;
  description: string;
  evidence: string;
}

interface GapAnalysis {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  error: string | null;
  yourUrl: string | null;
  competitorUrl: string | null;
  summary: string | null;
  gaps: GapItem[] | null;
}

const ACTIVE_GAP_STATUSES = new Set(["pending", "running"]);

/**
 * Phase 29's AI-inferred content-gap analysis, MOVED INTACT from
 * `CompetitorPanel`.
 *
 * It stays in its own `--inferred`-tinted block, visually separate from the
 * deterministic comparison above it, because that is the whole point of the
 * `--inferred` role: it marks PROVENANCE ("a language model wrote this"), not
 * a status. It never borrows a pass/fail colour, and the generated text is
 * always accompanied by which provider and model produced it and which two
 * URLs it read.
 *
 * This is also the one place on the Competitors report where anything
 * TOPICAL appears. Everything else is explicitly a "Technical & Structural
 * Comparison" — no Domain Authority, no backlink counts, no traffic estimates,
 * no toxicity score, because this platform measures none of those and
 * inventing them is exactly what Phase 28 refused to do.
 */
export function ContentGapBlock({ websiteId, competitorId }: { websiteId: string; competitorId: string }) {
  const [analyses, setAnalyses] = useState<GapAnalysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors/${competitorId}/content-gap`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load content gap analysis.");
      setAnalyses(body.analyses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content gap analysis.");
    }
  }, [websiteId, competitorId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const active = analyses?.some((entry) => ACTIVE_GAP_STATUSES.has(entry.status));
    if (active && !pollRef.current) {
      pollRef.current = setInterval(load, 2500);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [analyses, load]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/competitors/${competitorId}/content-gap`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to start content gap analysis.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start content gap analysis.");
    } finally {
      setStarting(false);
    }
  }

  const latest = analyses && analyses.length > 0 ? analyses[analyses.length - 1] : null;
  const busy = latest !== null && ACTIVE_GAP_STATUSES.has(latest.status);

  return (
    <div className="rounded-lg border border-inferred-border bg-inferred-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-semibold tracking-wide text-inferred uppercase">
            AI-inferred content gap analysis
          </span>
          <p className="mt-0.5 text-xs text-secondary-foreground">
            Uses a language model to compare each site&apos;s homepage (or most recently crawled page) text and
            suggest topics the competitor covers that you do not. This is an inference, not a measurement — it sits
            apart from the structural comparison above for exactly that reason.
          </p>
        </div>
        <Button type="button" variant="secondary" loading={starting || busy} onClick={start}>
          {busy ? "Analysing…" : latest?.status === "completed" ? "Re-run" : "Run analysis"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {latest?.status === "failed" && (
        <div className="mt-3">
          <Alert variant="error">{latest.error ?? "AI analysis unavailable."}</Alert>
        </div>
      )}

      {latest?.status === "completed" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted">
            Generated by {latest.provider ?? "an AI provider"} ({latest.model ?? "unknown model"}), comparing{" "}
            {latest.yourUrl} with {latest.competitorUrl}.
          </p>
          {latest.summary && <p className="text-sm text-secondary-foreground">{latest.summary}</p>}
          {latest.gaps && latest.gaps.length > 0 ? (
            <ul className="space-y-2">
              {latest.gaps.map((gap, index) => (
                <li key={index} className="rounded-md border border-default bg-surface p-2 text-sm">
                  <span className="font-medium text-foreground">{gap.topic}</span>
                  <p className="text-xs text-secondary-foreground">{gap.description}</p>
                  <p className="mt-1 text-[11px] text-muted italic">Evidence: {gap.evidence}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No meaningful gaps found.</p>
          )}
        </div>
      )}

      {!latest && !error && (
        <p className="mt-3 text-xs text-muted">
          Not run yet. Both sites need at least one completed crawl before there is any text to compare.
        </p>
      )}
    </div>
  );
}
