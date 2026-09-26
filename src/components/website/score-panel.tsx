"use client";

/**
 * Phase 22 — Scoring. Fetches the website's live-computed scores
 * (`GET /api/websites/[id]/scores`) on mount and lets the user refresh
 * on demand. Scores are computed live from already-persisted `seo_issues`
 * and `pagespeed_audits` rows (see src/lib/scoring/compute.ts) — cheap
 * enough that there's no cached/stale state to reconcile here.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { panelScoreLabel, panelScoreVariant } from "./score-band";

interface CategoryBreakdown {
  score: number;
  issueCounts: Record<string, number>;
  penalties: Record<string, number>;
  totalPenalty: number;
}

interface ScoreResult {
  technical: CategoryBreakdown;
  onPage: CategoryBreakdown;
  performance: { score: number | null; strategiesMeasured: string[] };
  overall: { score: number | null; weights: { technical: number; onPage: number; performance: number } };
}

function Gauge({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-default p-3 text-center">
      <span className="text-2xl leading-none font-bold text-foreground">{score ?? "—"}</span>
      <span className="mt-1 text-xs font-medium text-secondary-foreground">{label}</span>
      <Badge variant={panelScoreVariant(score)} className="mt-2">
        {panelScoreLabel(score)}
      </Badge>
    </div>
  );
}

function BreakdownRow({ label, breakdown }: { label: string; breakdown: CategoryBreakdown }) {
  const { issueCounts } = breakdown;
  const parts = (["critical", "high", "medium", "low", "info"] as const)
    .filter((sev) => issueCounts[sev] > 0)
    .map((sev) => `${issueCounts[sev]} ${sev}`);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-secondary-foreground">{label}</span>
      <span className="text-muted">{parts.length > 0 ? parts.join(", ") : "No issues found"}</span>
    </div>
  );
}

export function ScorePanel({ websiteId }: { websiteId: string }) {
  const [scores, setScores] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/scores`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load scores.");
      }
      const data = await res.json();
      setScores(data.scores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scores.");
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Proprietary product scores computed from this platform&apos;s own rule engines and Lighthouse audit data — not an
          official Google ranking score, and not a guarantee of search-ranking outcomes.
        </p>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {scores && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Gauge label="Overall" score={scores.overall.score} />
            <Gauge label="Technical" score={scores.technical.score} />
            <Gauge label="On-page" score={scores.onPage.score} />
            <Gauge label="Performance" score={scores.performance.score} />
          </div>

          <div className="space-y-1 rounded-lg border border-default bg-surface-subtle p-3">
            <BreakdownRow label="Technical (technical + schema issues)" breakdown={scores.technical} />
            <BreakdownRow label="On-page issues" breakdown={scores.onPage} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary-foreground">Performance</span>
              <span className="text-muted">
                {scores.performance.score === null
                  ? "Not measured — run a PageSpeed audit"
                  : `Lighthouse performance score, ${scores.performance.strategiesMeasured.join(" + ")}`}
              </span>
            </div>
          </div>

          {scores.overall.score === null && (
            <p className="text-xs text-muted">
              Overall score unavailable — no crawl or PageSpeed data yet for this website.
            </p>
          )}
        </>
      )}

      {!scores && !loading && !error && <p className="text-sm text-muted">No score data yet.</p>}
    </div>
  );
}
