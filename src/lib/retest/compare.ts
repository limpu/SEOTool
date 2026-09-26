/**
 * Phase 31 — Re-test (Before/After comparison), pure diff logic, no I/O.
 *
 * Master doc Section 64 / Phase 31 spec: "Compare: Before, After, Score
 * change, Issue change, CWV change, Recommendation status" and "Never claim
 * a fix worked without a fresh measurement." Every number this module
 * produces is a real arithmetic delta between two already-computed
 * snapshots (Phase 22's `ScoreResult` computed twice, once per crawl run,
 * and a rule-key-level issue snapshot computed twice) — nothing here infers,
 * estimates, or guesses; a `null` input on either side always propagates to
 * a `null` delta rather than being treated as 0.
 *
 * Reuse decision (see read.md's Phase 31 write-up for the full reasoning):
 * Phase 28's `src/lib/competitor/compare.ts` (`buildStructuralComparison`)
 * already established a "pure set-diff between two snapshots" pattern, but
 * its diff is presence/absence only (issue rule-KEYS only-you/only-them/
 * both) with no severity/category/affected-page-count carried through and
 * no score-delta arithmetic at all — it was built for TWO DIFFERENT WEBSITES
 * (yours vs. a competitor's), not two crawl runs of the SAME website across
 * time. Reusing it directly would mean stripping it down (dropping the
 * richer per-rule severity/category/count fields this phase's spec
 * explicitly asks for — "changed-affected-page-count") to fit its narrower
 * shape, or widening it in a way that would change Phase 28's already-
 * shipped, already-tested output shape. Per the task's own guidance ("if the
 * existing code isn't cleanly reusable without a disruptive refactor, it's
 * fine to write a parallel implementation"), this module is a parallel,
 * independent implementation that follows the SAME set-diff *pattern*
 * (Set-based membership checks, sorted deterministic output) but is not a
 * literal call-through to Phase 28's function.
 */

import type { Severity } from "@/lib/scoring/formula";
import type { ScoreResult } from "@/lib/scoring/compute";

// ─── Score deltas ───────────────────────────────────────────────────────────

export interface MetricDelta {
  before: number | null;
  after: number | null;
  /** after - before. `null` whenever either side is `null` — never inferred. */
  delta: number | null;
}

export interface ScoreDeltas {
  technical: MetricDelta;
  onPage: MetricDelta;
  performance: MetricDelta;
  overall: MetricDelta;
}

function metricDelta(before: number | null, after: number | null): MetricDelta {
  return {
    before,
    after,
    delta: before === null || after === null ? null : after - before,
  };
}

export function diffScores(before: ScoreResult, after: ScoreResult): ScoreDeltas {
  return {
    technical: metricDelta(before.technical.score, after.technical.score),
    onPage: metricDelta(before.onPage.score, after.onPage.score),
    performance: metricDelta(before.performance.score, after.performance.score),
    overall: metricDelta(before.overall.score, after.overall.score),
  };
}

// ─── Core Web Vitals deltas ─────────────────────────────────────────────────
// Note: for CWV, a LOWER value is better (faster/less shift), the opposite
// of score deltas — the UI/API consumer must apply that interpretation, this
// module only reports the raw signed delta (after - before), never a
// pre-judged "improved"/"regressed" label baked into the number itself.

export interface CoreWebVitalsSnapshot {
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  measuredAt: string | null;
}

export interface CoreWebVitalsDeltas {
  lcp: MetricDelta;
  cls: MetricDelta;
  inp: MetricDelta;
  beforeMeasuredAt: string | null;
  afterMeasuredAt: string | null;
}

export function diffCoreWebVitals(before: CoreWebVitalsSnapshot, after: CoreWebVitalsSnapshot): CoreWebVitalsDeltas {
  return {
    lcp: metricDelta(before.lcp, after.lcp),
    cls: metricDelta(before.cls, after.cls),
    inp: metricDelta(before.inp, after.inp),
    beforeMeasuredAt: before.measuredAt,
    afterMeasuredAt: after.measuredAt,
  };
}

// ─── Issue-count deltas by severity / category ─────────────────────────────

export interface IssueCountSnapshot {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<string, number>;
}

export interface IssueCountDeltas {
  before: IssueCountSnapshot;
  after: IssueCountSnapshot;
  totalDelta: number;
  bySeverityDelta: Record<Severity, number>;
  byCategoryDelta: Record<string, number>;
}

const ALL_SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export interface IssueInstanceForCount {
  severity: Severity;
  category: string;
}

export function buildIssueCountSnapshot(issues: IssueInstanceForCount[]): IssueCountSnapshot {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const byCategory: Record<string, number> = {};
  for (const issue of issues) {
    bySeverity[issue.severity] += 1;
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }
  return { total: issues.length, bySeverity, byCategory };
}

export function diffIssueCounts(before: IssueCountSnapshot, after: IssueCountSnapshot): IssueCountDeltas {
  const bySeverityDelta: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const sev of ALL_SEVERITIES) {
    bySeverityDelta[sev] = after.bySeverity[sev] - before.bySeverity[sev];
  }

  const categories = new Set([...Object.keys(before.byCategory), ...Object.keys(after.byCategory)]);
  const byCategoryDelta: Record<string, number> = {};
  for (const cat of categories) {
    byCategoryDelta[cat] = (after.byCategory[cat] ?? 0) - (before.byCategory[cat] ?? 0);
  }

  return {
    before,
    after,
    totalDelta: after.total - before.total,
    bySeverityDelta,
    byCategoryDelta,
  };
}

// ─── Rule-key level diff (appeared / disappeared / persisted) ──────────────

export interface RuleKeySnapshotEntry {
  ruleKey: string;
  title: string;
  category: string;
  severity: Severity;
  affectedPageCount: number;
}

export type RuleKeyDiffStatus = "appeared" | "disappeared" | "persisted";

export interface RuleKeyDiffEntry {
  ruleKey: string;
  title: string;
  category: string;
  severity: Severity;
  status: RuleKeyDiffStatus;
  beforeAffectedPageCount: number;
  afterAffectedPageCount: number;
  /** afterAffectedPageCount - beforeAffectedPageCount (0 for a persisted, unchanged-breadth rule). */
  affectedPageCountDelta: number;
}

export interface RuleKeyDiffResult {
  appeared: RuleKeyDiffEntry[];
  disappeared: RuleKeyDiffEntry[];
  persisted: RuleKeyDiffEntry[];
  newIssueRuleCount: number;
  resolvedIssueRuleCount: number;
  persistedIssueRuleCount: number;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function sortEntries(entries: RuleKeyDiffEntry[]): RuleKeyDiffEntry[] {
  return [...entries].sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.ruleKey.localeCompare(b.ruleKey);
  });
}

/**
 * Pure set-diff, following the same Set-based membership pattern Phase 28's
 * `buildStructuralComparison` uses (see this file's header comment) — but
 * carrying through severity/category/affected-page-count, which Phase 28's
 * narrower rule-key-only diff doesn't need.
 */
export function diffRuleKeys(before: RuleKeySnapshotEntry[], after: RuleKeySnapshotEntry[]): RuleKeyDiffResult {
  const beforeByKey = new Map(before.map((e) => [e.ruleKey, e]));
  const afterByKey = new Map(after.map((e) => [e.ruleKey, e]));
  const allKeys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);

  const appeared: RuleKeyDiffEntry[] = [];
  const disappeared: RuleKeyDiffEntry[] = [];
  const persisted: RuleKeyDiffEntry[] = [];

  for (const key of allKeys) {
    const b = beforeByKey.get(key);
    const a = afterByKey.get(key);

    if (!b && a) {
      appeared.push({
        ruleKey: a.ruleKey,
        title: a.title,
        category: a.category,
        severity: a.severity,
        status: "appeared",
        beforeAffectedPageCount: 0,
        afterAffectedPageCount: a.affectedPageCount,
        affectedPageCountDelta: a.affectedPageCount,
      });
    } else if (b && !a) {
      disappeared.push({
        ruleKey: b.ruleKey,
        title: b.title,
        category: b.category,
        severity: b.severity,
        status: "disappeared",
        beforeAffectedPageCount: b.affectedPageCount,
        afterAffectedPageCount: 0,
        affectedPageCountDelta: -b.affectedPageCount,
      });
    } else if (b && a) {
      persisted.push({
        ruleKey: a.ruleKey,
        title: a.title,
        category: a.category,
        severity: a.severity,
        status: "persisted",
        beforeAffectedPageCount: b.affectedPageCount,
        afterAffectedPageCount: a.affectedPageCount,
        affectedPageCountDelta: a.affectedPageCount - b.affectedPageCount,
      });
    }
  }

  return {
    appeared: sortEntries(appeared),
    disappeared: sortEntries(disappeared),
    persisted: sortEntries(persisted),
    newIssueRuleCount: appeared.length,
    resolvedIssueRuleCount: disappeared.length,
    persistedIssueRuleCount: persisted.length,
  };
}

// ─── Verdict summary ─────────────────────────────────────────────────────

export interface RetestVerdict {
  /** Human-readable summary built ONLY from real deltas below it — never a vague qualitative claim without the number behind it. */
  summary: string;
  overallScoreDelta: number | null;
  newIssueRuleCount: number;
  resolvedIssueRuleCount: number;
  noChangeDetected: boolean;
}

/**
 * Builds the final verdict string from real computed deltas. Per master doc
 * Section 64 ("Never claim a fix worked without a fresh measurement") and
 * Section 79 #3, every clause here is backed by a number already present in
 * `scoreDeltas`/`ruleKeyDiff` — nothing is inferred beyond what those two
 * already-computed structures contain. A website crawled twice with zero
 * underlying change correctly produces `noChangeDetected: true` and an
 * honest "No change detected" summary, not a fabricated improvement.
 */
export function buildRetestVerdict(scoreDeltas: ScoreDeltas, ruleKeyDiff: RuleKeyDiffResult): RetestVerdict {
  const overallScoreDelta = scoreDeltas.overall.delta;
  const { newIssueRuleCount, resolvedIssueRuleCount } = ruleKeyDiff;

  const parts: string[] = [];

  if (overallScoreDelta !== null && overallScoreDelta !== 0) {
    parts.push(
      overallScoreDelta > 0
        ? `Overall score improved by ${overallScoreDelta} point${overallScoreDelta === 1 ? "" : "s"} (${scoreDeltas.overall.before} → ${scoreDeltas.overall.after}).`
        : `Overall score dropped by ${Math.abs(overallScoreDelta)} point${Math.abs(overallScoreDelta) === 1 ? "" : "s"} (${scoreDeltas.overall.before} → ${scoreDeltas.overall.after}).`,
    );
  } else if (overallScoreDelta === 0) {
    parts.push(`Overall score unchanged (${scoreDeltas.overall.before}).`);
  } else {
    parts.push("Overall score not comparable (not measured on one or both runs).");
  }

  if (newIssueRuleCount > 0) {
    parts.push(`${newIssueRuleCount} new issue${newIssueRuleCount === 1 ? "" : "s"} introduced.`);
  }
  if (resolvedIssueRuleCount > 0) {
    parts.push(`${resolvedIssueRuleCount} issue${resolvedIssueRuleCount === 1 ? "" : "s"} resolved.`);
  }

  const noChangeDetected =
    (overallScoreDelta === 0 || overallScoreDelta === null) && newIssueRuleCount === 0 && resolvedIssueRuleCount === 0;

  if (noChangeDetected) {
    parts.length = 0;
    parts.push("No change detected between the two crawls.");
  }

  return {
    summary: parts.join(" "),
    overallScoreDelta,
    newIssueRuleCount,
    resolvedIssueRuleCount,
    noChangeDetected,
  };
}
