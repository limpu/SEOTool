"use client";

/**
 * Phase 23 — Recommendation Engine. Fetches the website's live-computed,
 * ranked recommendation list (`GET /api/websites/[id]/recommendations`) on
 * mount and lets the user refresh on demand — same fetch-on-mount +
 * manual-refresh pattern as Phase 22's `ScorePanel`/Phase 20's
 * `PageSpeedPanel`. Presents Critical/High/Medium/Low/Info sections, each
 * containing that tier's ranked recommendation entries (one per distinct
 * rule, aggregated across every page it fires on) with an expandable list
 * of affected pages — no new data-fetching paradigm invented here.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS, SEVERITY_ORDER, SEVERITY_VARIANT, type Severity } from "./severity";

interface AffectedPage {
  pageId: string;
  url: string;
  evidence: string | null;
}

interface RecommendationEntry {
  ruleKey: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string | null;
  fixExample: string | null;
  impact: string | null;
  affectedPageCount: number;
  affectedPages: AffectedPage[];
}

interface TieredRecommendations {
  critical: RecommendationEntry[];
  high: RecommendationEntry[];
  medium: RecommendationEntry[];
  low: RecommendationEntry[];
  info: RecommendationEntry[];
  totalRules: number;
  totalAffectedPageInstances: number;
}

function RecommendationCard({ entry }: { entry: RecommendationEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-default p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{entry.title}</p>
          <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
        </div>
        <Badge className="shrink-0">
          {entry.affectedPageCount} {entry.affectedPageCount === 1 ? "page" : "pages"}
        </Badge>
      </div>

      {entry.recommendation && (
        <p className="mt-2 text-sm text-secondary-foreground">
          <span className="font-medium">Recommended action: </span>
          {entry.recommendation}
        </p>
      )}
      {entry.fixExample && (
        <pre className="mt-1 overflow-x-auto rounded bg-surface-subtle p-2 text-xs text-secondary-foreground">{entry.fixExample}</pre>
      )}
      {entry.impact && (
        <p className="mt-1 text-xs text-muted">
          <span className="font-medium">Why it matters: </span>
          {entry.impact}
        </p>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-xs font-medium text-muted underline hover:text-secondary-foreground"
      >
        {expanded ? "Hide affected pages" : `Show affected pages (${entry.affectedPageCount})`}
      </button>

      {expanded && (
        <ul className="mt-2 space-y-1 border-t border-default pt-2">
          {entry.affectedPages.map((page) => (
            <li key={page.pageId} className="text-xs text-secondary-foreground">
              <a href={page.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {page.url}
              </a>
              {page.evidence && <span className="ml-1 text-muted">— {page.evidence}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecommendationsPanel({ websiteId }: { websiteId: string }) {
  const [data, setData] = useState<TieredRecommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${websiteId}/recommendations`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load recommendations.");
      }
      const body = await res.json();
      setData(body.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations.");
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
          Ranked by severity, then by how many pages each issue affects — one entry per distinct problem, not one row
          per page. Describes what is technically wrong and why it matters; not a guarantee of improved rankings or
          AI-search visibility.
        </p>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {data && data.totalRules === 0 && !loading && (
        <p className="text-sm text-muted">No outstanding issues found — run a crawl if you haven&apos;t yet.</p>
      )}

      {data &&
        SEVERITY_ORDER.map((key) => {
          const entries = data[key];
          if (entries.length === 0) return null;
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[key]}>{SEVERITY_LABELS[key]}</Badge>
                <span className="text-xs text-muted">
                  {entries.length} distinct {entries.length === 1 ? "issue" : "issues"}
                </span>
              </div>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <RecommendationCard key={entry.ruleKey} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
