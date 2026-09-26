/**
 * Phase 21 — Performance Diagnostics.
 *
 * Pure extraction/evaluation of resource-level diagnostic detail from the
 * SAME Lighthouse audits Phase 20 already runs and (as of this phase)
 * persists in `pagespeed_audits.rawResult`. This module does NOT run
 * Lighthouse and does NOT make any network call — it only reads the
 * `audits` map of an already-completed Lighthouse Result (or the trimmed
 * subset Phase 20/21 persist) and turns specific audit findings into
 * evidence-cited diagnostic signals.
 *
 * Every signal below is gated on Lighthouse's OWN audit score/details
 * (score is a number below 1, meaning Lighthouse itself identified an
 * issue, and `details.items` actually has content) — never an invented
 * threshold. This satisfies Section 79 rule #3 ("no fake data... every
 * metric must show its source") and rule #5 (proprietary judgement must be
 * clearly separated from Google's own facts) since these are Lighthouse's
 * own findings, just surfaced at resource-level instead of only the
 * headline category score Phase 20 already reports.
 *
 * Kept dependency-free (no `lighthouse`/`chrome-launcher` imports, same
 * discipline as extract-metrics.ts) so it can run both server-side (issue
 * attachment) and client-side (the PageSpeed panel's expandable diagnostic
 * sections, reading straight from the `rawResult` the API already returns)
 * without pulling Node-only packages into a client bundle.
 */

export interface DiagnosticAuditLike {
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number | null;
  displayValue?: string;
  details?: {
    items?: Array<Record<string, unknown>>;
  };
}

export type DiagnosticAuditsMap = Record<string, DiagnosticAuditLike | undefined | null>;

export interface PageSpeedDiagnosticSignal {
  ruleKey: string;
  evidence: string;
}

function fmtKB(bytes: unknown): string {
  return typeof bytes === "number" && Number.isFinite(bytes) ? `${Math.round(bytes / 1024)}KB` : "an unspecified amount";
}

function fmtMs(ms: unknown): string {
  return typeof ms === "number" && Number.isFinite(ms) ? `${Math.round(ms)}ms` : "an unspecified duration";
}

function fmtPercent(p: unknown): string {
  return typeof p === "number" && Number.isFinite(p) ? `${Math.round(p)}%` : "an unspecified share";
}

/** Basename-only URL for compact evidence strings (full URL kept available via the raw audit for the UI). */
function shortUrl(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) return "an inline resource";
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop();
    return base && base.length > 0 ? base : u.hostname;
  } catch {
    return url.length > 60 ? `${url.slice(0, 57)}...` : url;
  }
}

function items(audit: DiagnosticAuditLike | undefined | null): Array<Record<string, unknown>> {
  return audit?.details?.items ?? [];
}

/** True when Lighthouse's own audit score identifies a real (non-passing) finding with concrete evidence. */
function hasScoredFinding(audit: DiagnosticAuditLike | undefined | null): boolean {
  return !!audit && typeof audit.score === "number" && audit.score < 1 && items(audit).length > 0;
}

// ─── LCP diagnostics ──────────────────────────────────────────────────────

function lcpDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const signals: PageSpeedDiagnosticSignal[] = [];

  const elementAudit = audits["largest-contentful-paint-element"];
  const elementItems = items(elementAudit);
  if (elementItems.length > 0) {
    const first = elementItems[0];
    const node = (first.node ?? first) as Record<string, unknown>;
    const selector = typeof node.selector === "string" ? node.selector : typeof node.snippet === "string" ? node.snippet : null;
    if (selector) {
      signals.push({
        ruleKey: "PAGESPEED_LCP_ELEMENT_IDENTIFIED",
        evidence: `Lighthouse identified the LCP element as \`${selector}\` (from the "largest-contentful-paint-element" audit).`,
      });
    }
  }

  const lazyAudit = audits["lcp-lazy-loaded"];
  if (lazyAudit && typeof lazyAudit.score === "number" && lazyAudit.score < 1) {
    signals.push({
      ruleKey: "PAGESPEED_LCP_LAZY_LOADED",
      evidence: `Lighthouse's "lcp-lazy-loaded" audit failed (score ${lazyAudit.score}): the LCP element is loaded with \`loading="lazy"\`, which delays its render and directly harms LCP.`,
    });
  }

  return signals;
}

// ─── CLS diagnostics ──────────────────────────────────────────────────────

function clsDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const audit = audits["layout-shift-elements"];
  const rows = items(audit);
  if (rows.length === 0) return [];

  const top = rows.slice(0, 3).map((row) => {
    const node = (row.node ?? row) as Record<string, unknown>;
    const selector = typeof node.selector === "string" ? node.selector : "an unidentified element";
    const score = typeof row.score === "number" ? row.score.toFixed(3) : null;
    return score ? `\`${selector}\` (shift contribution ${score})` : `\`${selector}\``;
  });

  return [
    {
      ruleKey: "PAGESPEED_CLS_ELEMENTS_IDENTIFIED",
      evidence: `Lighthouse's "layout-shift-elements" audit found ${rows.length} element(s) contributing to layout shift on this page: ${top.join(", ")}${rows.length > 3 ? `, and ${rows.length - 3} more` : ""}.`,
    },
  ];
}

// ─── INP / TBT (long tasks, main-thread work) diagnostics ─────────────────

function inpDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const signals: PageSpeedDiagnosticSignal[] = [];

  const longTasks = audits["long-tasks"];
  const taskRows = items(longTasks);
  if (taskRows.length > 0) {
    const totalDuration = taskRows.reduce((sum, r) => sum + (typeof r.duration === "number" ? r.duration : 0), 0);
    const worst = [...taskRows].sort(
      (a, b) => (typeof b.duration === "number" ? b.duration : 0) - (typeof a.duration === "number" ? a.duration : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_LONG_TASKS",
      evidence: `Lighthouse's "long-tasks" audit found ${taskRows.length} long main-thread task(s) totaling ${fmtMs(totalDuration)}; the longest (${fmtMs(worst.duration)}) is from ${shortUrl(worst.url)}. Long tasks block the main thread and directly harm INP.`,
    });
  }

  const mainThread = audits["mainthread-work-breakdown"];
  if (hasScoredFinding(mainThread)) {
    const rows = items(mainThread);
    const worst = [...rows].sort(
      (a, b) => (typeof b.duration === "number" ? b.duration : 0) - (typeof a.duration === "number" ? a.duration : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_MAINTHREAD_WORK_HIGH",
      evidence: `Lighthouse's "mainthread-work-breakdown" audit scored ${mainThread!.score} (${mainThread!.displayValue ?? fmtMs(mainThread!.numericValue)} total); the largest contributor is "${worst.groupLabel ?? worst.group ?? "unlabeled"}" at ${fmtMs(worst.duration)}.`,
    });
  }

  return signals;
}

// ─── JS diagnostics ─────────────────────────────────────────────────────

function jsDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const signals: PageSpeedDiagnosticSignal[] = [];

  const bootup = audits["bootup-time"];
  if (hasScoredFinding(bootup)) {
    const rows = items(bootup);
    const worst = [...rows].sort((a, b) => (typeof b.total === "number" ? b.total : 0) - (typeof a.total === "number" ? a.total : 0))[0];
    signals.push({
      ruleKey: "PAGESPEED_JS_BOOTUP_HIGH",
      evidence: `Lighthouse's "bootup-time" audit scored ${bootup!.score} (${bootup!.displayValue ?? fmtMs(bootup!.numericValue)} total JS execution); the heaviest script is ${shortUrl(worst.url)} at ${fmtMs(worst.total)} CPU time.`,
    });
  }

  const unused = audits["unused-javascript"];
  if (hasScoredFinding(unused)) {
    const rows = items(unused);
    const worst = [...rows].sort(
      (a, b) => (typeof b.wastedBytes === "number" ? b.wastedBytes : 0) - (typeof a.wastedBytes === "number" ? a.wastedBytes : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_JS_UNUSED",
      evidence: `Lighthouse's "unused-javascript" audit (${unused!.displayValue ?? "estimated savings available"}) found ${fmtKB(worst.wastedBytes)} of unused JavaScript (${fmtPercent(worst.wastedPercent)} of the file) in ${shortUrl(worst.url)}.`,
    });
  }

  const unminified = audits["unminified-javascript"];
  if (hasScoredFinding(unminified)) {
    const rows = items(unminified);
    const worst = [...rows].sort(
      (a, b) => (typeof b.wastedBytes === "number" ? b.wastedBytes : 0) - (typeof a.wastedBytes === "number" ? a.wastedBytes : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_JS_UNMINIFIED",
      evidence: `Lighthouse's "unminified-javascript" audit (${unminified!.displayValue ?? "estimated savings available"}) found ${fmtKB(worst.wastedBytes)} could be saved by minifying ${shortUrl(worst.url)}.`,
    });
  }

  return signals;
}

// ─── CSS diagnostics ────────────────────────────────────────────────────

function cssDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const signals: PageSpeedDiagnosticSignal[] = [];

  const unused = audits["unused-css-rules"];
  if (hasScoredFinding(unused)) {
    const rows = items(unused);
    const worst = [...rows].sort(
      (a, b) => (typeof b.wastedBytes === "number" ? b.wastedBytes : 0) - (typeof a.wastedBytes === "number" ? a.wastedBytes : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_CSS_UNUSED",
      evidence: `Lighthouse's "unused-css-rules" audit (${unused!.displayValue ?? "estimated savings available"}) found ${fmtKB(worst.wastedBytes)} of unused CSS (${fmtPercent(worst.wastedPercent)}) in ${shortUrl(worst.url)}.`,
    });
  }

  const unminified = audits["unminified-css"];
  if (hasScoredFinding(unminified)) {
    const rows = items(unminified);
    const worst = [...rows].sort(
      (a, b) => (typeof b.wastedBytes === "number" ? b.wastedBytes : 0) - (typeof a.wastedBytes === "number" ? a.wastedBytes : 0)
    )[0];
    signals.push({
      ruleKey: "PAGESPEED_CSS_UNMINIFIED",
      evidence: `Lighthouse's "unminified-css" audit (${unminified!.displayValue ?? "estimated savings available"}) found ${fmtKB(worst.wastedBytes)} could be saved by minifying ${shortUrl(worst.url)}.`,
    });
  }

  const renderBlocking = audits["render-blocking-resources"];
  if (hasScoredFinding(renderBlocking)) {
    const rows = items(renderBlocking);
    const total = rows.reduce((sum, r) => sum + (typeof r.wastedMs === "number" ? r.wastedMs : 0), 0);
    const worst = [...rows].sort((a, b) => (typeof b.wastedMs === "number" ? b.wastedMs : 0) - (typeof a.wastedMs === "number" ? a.wastedMs : 0))[0];
    signals.push({
      ruleKey: "PAGESPEED_RENDER_BLOCKING_RESOURCES",
      evidence: `Lighthouse's "render-blocking-resources" audit found ${rows.length} render-blocking resource(s) costing ~${fmtMs(total)} total; the worst is ${shortUrl(worst.url)} at ${fmtMs(worst.wastedMs)}.`,
    });
  }

  return signals;
}

// ─── Fonts diagnostics ──────────────────────────────────────────────────

function fontsDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  const signals: PageSpeedDiagnosticSignal[] = [];

  const fontDisplay = audits["font-display"];
  if (hasScoredFinding(fontDisplay)) {
    const rows = items(fontDisplay);
    const list = rows.slice(0, 3).map((r) => shortUrl(r.url)).join(", ");
    signals.push({
      ruleKey: "PAGESPEED_FONT_DISPLAY_MISSING",
      evidence: `Lighthouse's "font-display" audit found ${rows.length} font(s) without a \`font-display\` strategy, risking invisible text during load: ${list}${rows.length > 3 ? `, and ${rows.length - 3} more` : ""}.`,
    });
  }

  return signals;
}

/**
 * Runs every Phase 21 diagnostic category against one strategy's audits map
 * and returns the combined, evidence-cited signal list. Pure — callers
 * decide whether to persist (server) or just render (client).
 */
export function evaluatePageSpeedDiagnostics(audits: DiagnosticAuditsMap): PageSpeedDiagnosticSignal[] {
  return [
    ...lcpDiagnostics(audits),
    ...clsDiagnostics(audits),
    ...inpDiagnostics(audits),
    ...jsDiagnostics(audits),
    ...cssDiagnostics(audits),
    ...fontsDiagnostics(audits),
  ];
}
