"use client";

/**
 * Phase 31 — Re-test (Before/After comparison). Fetches the default
 * most-recent-pair comparison on mount (`GET /api/websites/[id]/compare`),
 * and lets the user pick a different baseline/current crawl run pair from
 * this website's own completed crawl history (`GET
 * /api/websites/[id]/crawl-runs`, filtered client-side to `completed`) —
 * same fetch-on-mount + manual-refresh convention `ScorePanel`/
 * `RecommendationsPanel` already establish, and the same delta/score-gauge
 * visual language as `ScorePanel` (reused, not reinvented) for the
 * before/after score cards.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TrendingDown, TrendingUp } from "lucide-react";

interface MetricDelta {
  before: number | null;
  after: number | null;
  delta: number | null;
}

interface ScoreDeltas {
  technical: MetricDelta;
  onPage: MetricDelta;
  performance: MetricDelta;
  overall: MetricDelta;
}

interface RuleKeyDiffEntry {
  ruleKey: string;
  title: string;
  category: string;
  severity: string;
  status: "appeared" | "disappeared" | "persisted";
  beforeAffectedPageCount: number;
  afterAffectedPageCount: number;
  affectedPageCountDelta: number;
}

interface RetestComparison {
  available: true;
  baselineCrawlRunId: string;
  currentCrawlRunId: string;
  baselineCompletedAt: string | null;
  currentCompletedAt: string | null;
  scoreDeltas: ScoreDeltas;
  issueCountDeltas: {
    before: { total: number };
    after: { total: number };
    totalDelta: number;
    bySeverityDelta: Record<string, number>;
  };
  ruleKeyDiff: {
    appeared: RuleKeyDiffEntry[];
    disappeared: RuleKeyDiffEntry[];
    persisted: RuleKeyDiffEntry[];
    newIssueRuleCount: number;
    resolvedIssueRuleCount: number;
    persistedIssueRuleCount: number;
  };
  coreWebVitalsDeltas: {
    lcp: MetricDelta;
    cls: MetricDelta;
    inp: MetricDelta;
  };
  verdict: { summary: string; noChangeDetected: boolean };
  disclaimer: string;
}

interface RetestUnavailable {
  available: false;
  reason: string;
  completedCrawlRunCount: number;
  disclaimer: string;
}

type RetestResult = RetestComparison | RetestUnavailable;

interface CrawlRunOption {
  id: string;
  status: string;
  createdAt: string;
}

/**
 * Before/after movement wears the DELTA roles, never the status ramp — this
 * is a direction of travel, not a verdict on a measurement. `higherIsBetter`
 * is why: for LCP/CLS/INP a FALLING number is the improvement, so which way
 * is "up" is decided here in code and never inferred from the raw sign.
 */
function deltaColor(delta: number | null, higherIsBetter = true): string {
  if (delta === null || delta === 0) return "text-delta-flat";
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? "text-delta-up" : "text-delta-down";
}

function DeltaCell({ label, delta, unit = "", higherIsBetter = true }: { label: string; delta: MetricDelta; unit?: string; higherIsBetter?: boolean }) {
  return (
    <div className="rounded-lg border border-default bg-surface-subtle p-3 text-center">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 flex items-baseline justify-center gap-1 text-sm">
        <span className="text-muted">{delta.before ?? "—"}</span>
        <span className="text-muted">→</span>
        <span className="font-semibold text-foreground">{delta.after ?? "—"}</span>
      </div>
      <div className={`mt-1 text-xs font-semibold ${deltaColor(delta.delta, higherIsBetter)}`}>
        {delta.delta === null ? "not comparable" : delta.delta === 0 ? "no change" : `${delta.delta > 0 ? "+" : ""}${delta.delta}${unit}`}
      </div>
    </div>
  );
}

export function RetestPanel({ websiteId }: { websiteId: string }) {
  const [result, setResult] = useState<RetestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<CrawlRunOption[]>([]);
  const [baselineId, setBaselineId] = useState<string>("");
  const [currentId, setCurrentId] = useState<string>("");

  const load = useCallback(
    async (baseline?: string, current?: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = baseline && current ? `?baseline=${baseline}&current=${current}` : "";
        const res = await fetch(`/api/websites/${websiteId}/compare${qs}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load comparison.");
        }
        const data: RetestResult = await res.json();
        setResult(data);
        if (data.available) {
          setBaselineId(data.baselineCrawlRunId);
          setCurrentId(data.currentCrawlRunId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comparison.");
      } finally {
        setLoading(false);
      }
    },
    [websiteId],
  );

  useEffect(() => {
    load();
    (async () => {
      try {
        const res = await fetch(`/api/websites/${websiteId}/crawl-runs`);
        if (!res.ok) return;
        const data = await res.json();
        const completed = (data.crawlRuns ?? []).filter((r: CrawlRunOption) => r.status === "completed");
        setRuns(completed);
      } catch {
        // Picker is a convenience — silently leave it empty if this fails, the default comparison above still loaded.
      }
    })();
  }, [load, websiteId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Compares two of this website&apos;s own completed crawls — real score/issue deltas, never a fabricated improvement or regression.
        </p>
        <Button type="button" variant="secondary" onClick={() => load(baselineId || undefined, currentId || undefined)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {runs.length >= 2 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-default bg-surface-subtle p-3">
          <label className="text-xs text-secondary-foreground">
            Baseline (before)
            <select
              className="mt-1 block rounded-md border border-default px-2 py-1 text-sm"
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-secondary-foreground">
            Current (after)
            <select
              className="mt-1 block rounded-md border border-default px-2 py-1 text-sm"
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => load(baselineId, currentId)} disabled={loading || !baselineId || !currentId || baselineId === currentId}>
            Compare selected
          </Button>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      {result && !result.available && (
        <Alert variant="info">
          {result.reason} ({result.completedCrawlRunCount} completed crawl{result.completedCrawlRunCount === 1 ? "" : "s"} so far.)
        </Alert>
      )}

      {result && result.available && (
        <>
          {result.verdict.noChangeDetected ? (
            <div className="rounded-lg border border-default bg-surface-subtle p-3 text-sm font-medium text-secondary-foreground">
              {result.verdict.summary}
            </div>
          ) : (
            <Alert variant="info">
              <span className="font-medium">{result.verdict.summary}</span>
            </Alert>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">SEO Health Score</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DeltaCell label="Overall" delta={result.scoreDeltas.overall} />
              <DeltaCell label="Technical" delta={result.scoreDeltas.technical} />
              <DeltaCell label="On-page" delta={result.scoreDeltas.onPage} />
              <DeltaCell label="Performance" delta={result.scoreDeltas.performance} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">Core Web Vitals</h3>
            <div className="grid grid-cols-3 gap-3">
              <DeltaCell label="LCP (ms)" delta={result.coreWebVitalsDeltas.lcp} higherIsBetter={false} />
              <DeltaCell label="CLS" delta={result.coreWebVitalsDeltas.cls} higherIsBetter={false} />
              <DeltaCell label="INP (ms)" delta={result.coreWebVitalsDeltas.inp} higherIsBetter={false} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-default bg-surface-subtle p-3 text-sm">
              <div className="font-medium text-secondary-foreground">Total issues</div>
              <div className="mt-1 tabular text-muted">
                {result.issueCountDeltas.before.total} → {result.issueCountDeltas.after.total} (
                <span className={deltaColor(-result.issueCountDeltas.totalDelta)}>
                  {result.issueCountDeltas.totalDelta > 0 ? "+" : ""}
                  {result.issueCountDeltas.totalDelta}
                </span>
                )
              </div>
            </div>
            <div className="rounded-lg border border-default bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                <TrendingDown className="h-4 w-4 shrink-0 text-delta-up" aria-hidden="true" />
                Resolved rules
              </div>
              <div className="mt-1 tabular font-semibold text-delta-up">
                {result.ruleKeyDiff.resolvedIssueRuleCount}
              </div>
            </div>
            <div className="rounded-lg border border-default bg-surface-subtle p-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-secondary-foreground">
                <TrendingUp className="h-4 w-4 shrink-0 text-delta-down" aria-hidden="true" />
                New rules
              </div>
              <div className="mt-1 tabular font-semibold text-delta-down">
                {result.ruleKeyDiff.newIssueRuleCount}
              </div>
            </div>
          </div>

          {result.ruleKeyDiff.appeared.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 shrink-0 text-delta-down" aria-hidden="true" />
                New issues ({result.ruleKeyDiff.appeared.length})
              </h3>
              <ul className="space-y-1 text-sm text-secondary-foreground">
                {result.ruleKeyDiff.appeared.map((e) => (
                  <li key={e.ruleKey}>
                    {e.title} <span className="text-muted">— {e.severity}, {e.afterAffectedPageCount} page{e.afterAffectedPageCount === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.ruleKeyDiff.disappeared.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingDown className="h-4 w-4 shrink-0 text-delta-up" aria-hidden="true" />
                Resolved issues ({result.ruleKeyDiff.disappeared.length})
              </h3>
              <ul className="space-y-1 text-sm text-secondary-foreground">
                {result.ruleKeyDiff.disappeared.map((e) => (
                  <li key={e.ruleKey}>
                    {e.title} <span className="text-muted">— was {e.severity}, {e.beforeAffectedPageCount} page{e.beforeAffectedPageCount === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.ruleKeyDiff.persisted.filter((e) => e.affectedPageCountDelta !== 0).length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-secondary-foreground">Changed breadth</h3>
              <ul className="space-y-1 text-sm text-secondary-foreground">
                {result.ruleKeyDiff.persisted
                  .filter((e) => e.affectedPageCountDelta !== 0)
                  .map((e) => (
                    <li key={e.ruleKey}>
                      {e.title}{" "}
                      <span className={deltaColor(-e.affectedPageCountDelta)}>
                        {e.beforeAffectedPageCount} → {e.afterAffectedPageCount} pages
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted">{result.disclaimer}</p>
        </>
      )}
    </div>
  );
}
