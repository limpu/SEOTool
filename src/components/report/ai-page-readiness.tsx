"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { scoreBand, scoreBandLabel } from "@/components/charts/format";

/**
 * Stage 3A — the per-page half of the AI Search Overview, and the home of the
 * Phase 29 AI-inferred assessment that the retired `AiSearchPanel` used to
 * own.
 *
 * TWO THINGS CHANGED FROM THE OLD PANEL, AND NOTHING ELSE:
 *
 * 1. The readiness data is now handed in as props by the Server Component
 *    instead of being fetched on mount from `/api/websites/[id]/ai-search`.
 *    The API route is untouched and still serves that JSON — it is a public
 *    surface — but the page no longer needs a client round-trip to show its
 *    own numbers.
 * 2. Each page's assessed dimensions arrive already de-duplicated across the
 *    GEO/AEO/AIO sets (see `uniqueAssessedDimensions`), because Phase 24
 *    reuses one dimension in several composites and printing it three times
 *    told the reader nothing extra.
 *
 * The AI-inferred block below is carried over intact, including its explicit
 * trigger, its polling, and its `--inferred` provenance treatment. That
 * treatment is deliberately NOT a status colour: it says "a language model
 * wrote this", which is a statement about where the text came from, not a
 * verdict about the page.
 */

export interface AiPageRow {
  pageId: string;
  url: string;
  geo: number | null;
  aeo: number | null;
  aio: number | null;
  dimensions: { key: string; label: string; score: number | null; evidence: string }[];
}

function ScoreChip({ label, score }: { label: string; score: number | null }) {
  const band = scoreBand(score);
  return (
    <span className="inline-flex items-baseline gap-1 text-xs">
      <span className="text-muted">{label}</span>
      {score === null ? (
        <span className="font-medium text-muted">Not assessed</span>
      ) : (
        <span className="tabular font-semibold text-foreground" title={scoreBandLabel(band)}>
          {score}
        </span>
      )}
    </span>
  );
}

// ─── Phase 29 — AI-inferred assessment for one page ────────────────────────

interface AiDimension {
  score: number | null;
  confidence: number | null;
  explanation: string;
}

interface AiAssessment {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  error: string | null;
  source: "ai_inferred";
  answerability: AiDimension | null;
  semanticCompleteness: AiDimension | null;
  directAnswers: AiDimension | null;
  answerCompleteness: AiDimension | null;
}

const ACTIVE_AI_STATUSES = new Set(["pending", "running"]);

function AiDimensionRow({ label, dim }: { label: string; dim: AiDimension | null }) {
  if (!dim) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-inferred-border py-2 text-sm last:border-0">
      <div className="min-w-0">
        <span className="font-medium text-secondary-foreground">{label}</span>
        <p className="text-xs text-muted">{dim.explanation}</p>
        {dim.confidence !== null && (
          <p className="text-[11px] text-muted">Model confidence: {Math.round(dim.confidence * 100)}%</p>
        )}
      </div>
      <span className="tabular shrink-0 text-sm font-semibold text-inferred">
        {dim.score === null ? "—" : dim.score}
      </span>
    </div>
  );
}

function AiAssessmentBlock({ pageId }: { pageId: string }) {
  const [assessments, setAssessments] = useState<AiAssessment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/ai-assessment`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load AI assessment.");
      setAssessments(body.assessments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI assessment.");
    }
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const active = assessments?.some((a) => ACTIVE_AI_STATUSES.has(a.status));
    if (active && !pollRef.current) {
      pollRef.current = setInterval(load, 2000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [assessments, load]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/ai-assessment`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to start AI assessment.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start AI assessment.");
    } finally {
      setStarting(false);
    }
  }

  const latest = assessments && assessments.length > 0 ? assessments[assessments.length - 1] : null;
  const busy = latest ? ACTIVE_AI_STATUSES.has(latest.status) : false;

  return (
    <div className="mt-3 rounded-lg border border-inferred-border bg-inferred-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-inferred uppercase">AI-Inferred Assessment</span>
        <Button type="button" variant="secondary" loading={starting || busy} onClick={start}>
          {busy ? "Analysing…" : latest?.status === "completed" ? "Re-run" : "Run AI assessment"}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Covers the four dimensions this platform deliberately does not score deterministically (Answerability,
        Semantic Completeness, Direct Answers, Answer Completeness). Generated by a language model reading the page —
        it is never blended into the readiness scores above.
      </p>
      {error && (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {latest?.status === "failed" && (
        <div className="mt-2">
          <Alert variant="error">{latest.error ?? "AI analysis unavailable."}</Alert>
        </div>
      )}
      {latest?.status === "completed" && (
        <div className="mt-2">
          <p className="mb-2 text-[11px] text-muted">
            Generated by {latest.provider ?? "an AI provider"} ({latest.model ?? "unknown model"}). An AI-generated
            inference, not a deterministic measurement.
          </p>
          <AiDimensionRow label="Answerability" dim={latest.answerability} />
          <AiDimensionRow label="Semantic Completeness" dim={latest.semanticCompleteness} />
          <AiDimensionRow label="Direct Answers" dim={latest.directAnswers} />
          <AiDimensionRow label="Answer Completeness" dim={latest.answerCompleteness} />
        </div>
      )}
      {!latest && !error && <p className="mt-2 text-xs text-muted">Not run for this page yet.</p>}
    </div>
  );
}

// ─── The page list ─────────────────────────────────────────────────────────

export function AiPageReadinessList({ pages }: { pages: AiPageRow[] }) {
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);

  if (pages.length === 0) {
    return <p className="text-sm text-muted">No successfully-crawled pages were assessed.</p>;
  }

  return (
    <ul className="divide-y divide-default rounded-lg border border-default">
      {pages.map((page) => {
        const expanded = expandedPageId === page.pageId;
        return (
          <li key={page.pageId} className="p-3">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedPageId(expanded ? null : page.pageId)}
              className="flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className="truncate text-sm font-medium text-secondary-foreground" title={page.url}>
                  {page.url}
                </span>
              </span>
              <span className="flex shrink-0 gap-3">
                <ScoreChip label="GEO" score={page.geo} />
                <ScoreChip label="AEO" score={page.aeo} />
                <ScoreChip label="AIO" score={page.aio} />
              </span>
            </button>

            {expanded && (
              <div className="mt-3">
                <ul className="rounded-lg border border-default px-3">
                  {page.dimensions.map((dimension) => (
                    <li
                      key={dimension.key}
                      className="flex items-start justify-between gap-4 border-b border-default py-2 text-sm last:border-0"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-secondary-foreground">{dimension.label}</span>
                        <p className="text-xs text-muted">{dimension.evidence}</p>
                      </div>
                      <Badge variant={dimension.score === null ? "unknown" : "neutral"} className="shrink-0">
                        {dimension.score === null ? "Not assessed" : dimension.score}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <AiAssessmentBlock pageId={page.pageId} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
