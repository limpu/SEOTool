/**
 * Phase 30 — Reports: standalone HTML export.
 *
 * "HTML, not PDF" is a faithful reading of the master doc's own Phase 30
 * spec ("Implement: HTML / CSV / JSON. PDF later.") — PDF is explicitly
 * named as future scope, not this phase's. A single self-contained HTML
 * file (inline CSS, zero external asset/network dependency) is a real,
 * legitimate "HTML export": it opens directly in any browser, is
 * presentable enough to hand to a client, and can be printed/saved to PDF
 * from the user's own browser print dialog if they want a PDF — without
 * this codebase taking on a heavy, historically-finicky-in-this-environment
 * headless-Chrome rendering dependency (Phase 20's Lighthouse/chrome-
 * launcher write-up already documents real friction with exactly that kind
 * of dependency).
 *
 * Every string interpolated from report data that could contain untrusted
 * external content (crawled page titles/URLs/evidence text, user-entered
 * keyword text, AI-inferred explanation strings) goes through `escapeHtml`
 * — this file has zero raw `${...}` interpolation of report data into the
 * HTML string. This is the concrete defense against the stored-XSS-via-
 * crawled-page-title risk this phase was explicitly asked to guard against.
 */

import { escapeHtml } from "./escape";
import type { WebsiteReport } from "./assemble";
import type { RecommendationTier } from "@/lib/recommendations/prioritize";

function fmtScore(score: number | null): string {
  return score === null ? "Not measured" : String(score);
}

function fmtPct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

const TIER_LABELS: Record<RecommendationTier, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

function renderRecommendationTier(report: WebsiteReport, tier: RecommendationTier): string {
  const entries = report.recommendations[tier];
  if (entries.length === 0) return "";
  const rows = entries
    .map(
      (e) => `
      <div class="rec-entry rec-${escapeHtml(tier)}">
        <div class="rec-title">${escapeHtml(e.title)} <span class="badge">${e.affectedPageCount} page(s)</span></div>
        <div class="rec-desc">${escapeHtml(e.description)}</div>
        ${e.recommendation ? `<div class="rec-fix"><strong>Recommendation:</strong> ${escapeHtml(e.recommendation)}</div>` : ""}
        ${e.fixExample ? `<div class="rec-fix"><strong>Example fix:</strong> <code>${escapeHtml(e.fixExample)}</code></div>` : ""}
        ${e.impact ? `<div class="rec-fix"><strong>Why it matters:</strong> ${escapeHtml(e.impact)}</div>` : ""}
      </div>`
    )
    .join("\n");
  return `<h3 class="tier-heading tier-${escapeHtml(tier)}">${TIER_LABELS[tier]} (${entries.length})</h3>${rows}`;
}

function findDim(dims: { key: string; score: number | null }[], key: string): number | null {
  return dims.find((d) => d.key === key)?.score ?? null;
}

function renderDimension(d: { label: string; status: string; score: number | null; evidence: string; reason?: string }): string {
  if (d.status === "unassessed") {
    return `<tr><td>${escapeHtml(d.label)}</td><td class="unassessed">Not measured</td><td>${escapeHtml(d.reason ?? "")}</td></tr>`;
  }
  return `<tr><td>${escapeHtml(d.label)}</td><td>${escapeHtml(fmtScore(d.score))}</td><td>${escapeHtml(d.evidence)}</td></tr>`;
}

export function renderHtmlReport(report: WebsiteReport): string {
  const w = report.website;
  const s = report.scores;

  const issueCountRows = Object.entries(report.issueCounts.byCategory)
    .map(([cat, count]) => `<tr><td>${escapeHtml(cat)}</td><td>${count}</td></tr>`)
    .join("");
  const severityRows = Object.entries(report.issueCounts.bySeverity)
    .map(([sev, count]) => `<tr><td>${escapeHtml(sev)}</td><td>${count}</td></tr>`)
    .join("");

  const recommendationsHtml = (["critical", "high", "medium", "low", "info"] as RecommendationTier[])
    .map((tier) => renderRecommendationTier(report, tier))
    .join("\n");

  const perPageAiSearch = report.aiSearch.pages
    .map(
      (p) => `
      <details class="page-detail">
        <summary>${escapeHtml(p.url)} — GEO ${fmtScore(p.geo.score)} / AEO ${fmtScore(p.aeo.score)} / AIO ${fmtScore(p.aio.score)}</summary>
        <table class="dim-table">
          <thead><tr><th>Dimension</th><th>Score</th><th>Evidence / Reason</th></tr></thead>
          <tbody>
            ${p.geo.dimensions.map(renderDimension).join("")}
          </tbody>
        </table>
      </details>`
    )
    .join("\n");

  const eeatPages = report.eeat.pages
    .filter((p) => p.eligible)
    .map(
      (p) => `<tr><td>${escapeHtml(p.url)}</td><td>${p.wordCount}</td><td>${escapeHtml(fmtScore(p.authorSignal?.score ?? null))}</td><td>${escapeHtml(p.authorSignal?.evidence ?? "")}</td></tr>`
    )
    .join("");

  const pagespeedSection = report.pagespeed.available
    ? `<table class="data-table">
        <thead><tr><th>URL</th><th>Strategy</th><th>Performance</th><th>Accessibility</th><th>Best Practices</th><th>SEO</th><th>LCP (ms)</th><th>CLS</th><th>INP (ms)</th></tr></thead>
        <tbody>
          ${report.pagespeed.latestBatch!.audits
            .map(
              (a) =>
                `<tr><td>${escapeHtml(a.url)}</td><td>${escapeHtml(a.strategy)}</td><td>${escapeHtml(fmtScore(a.performanceScore))}</td><td>${escapeHtml(fmtScore(a.accessibilityScore))}</td><td>${escapeHtml(fmtScore(a.bestPracticesScore))}</td><td>${escapeHtml(fmtScore(a.seoScore))}</td><td>${escapeHtml(a.lcp !== null ? String(a.lcp) : "—")}</td><td>${escapeHtml(a.cls !== null ? String(a.cls) : "—")}</td><td>${escapeHtml(a.inp !== null ? String(a.inp) : "—")}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : `<p class="not-available">${escapeHtml(report.pagespeed.reason ?? "Not available.")}</p>`;

  const gscSection = report.gsc.hasSyncedData
    ? `<p>Property: <code>${escapeHtml(report.gsc.propertyUrl ?? "")}</code> — range ${escapeHtml(report.gsc.dateRangeStart ?? "")} to ${escapeHtml(report.gsc.dateRangeEnd ?? "")}</p>
       <h4>Top queries</h4>
       <table class="data-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg. Position</th></tr></thead>
       <tbody>${(report.gsc.topQueries ?? [])
         .map((q) => `<tr><td>${escapeHtml(q.query)}</td><td>${q.clicks}</td><td>${q.impressions}</td><td>${fmtPct(q.ctr)}</td><td>${q.position.toFixed(1)}</td></tr>`)
         .join("")}</tbody></table>`
    : `<p class="not-available">${escapeHtml(report.gsc.reason ?? "Not available.")}</p>`;

  const keywordsSection =
    report.keywords.count > 0
      ? `<table class="data-table"><thead><tr><th>Keyword</th><th>Target URL</th><th>Manual Position</th><th>GSC Position</th><th>Source</th></tr></thead>
         <tbody>${report.keywords.keywords
           .map(
             (k) =>
               `<tr><td>${escapeHtml(k.keyword)}</td><td>${escapeHtml(k.targetUrl ?? "—")}</td><td>${escapeHtml(k.latestManualPosition !== null ? String(k.latestManualPosition) : "—")}</td><td>${escapeHtml(k.gscPosition !== null ? String(k.gscPosition) : "—")}</td><td>${escapeHtml(k.gscSource)}</td></tr>`
           )
           .join("")}</tbody></table>`
      : `<p class="not-available">No keywords are being tracked for this website yet.</p>`;

  const competitorsSection =
    report.competitors.count > 0
      ? report.competitors.competitors
          .map(
            (c) => `
        <h4>${escapeHtml(c.competitorName)} (${escapeHtml(c.competitorUrl)})</h4>
        <table class="data-table">
          <thead><tr><th></th><th>Pages</th><th>Avg. Words</th><th>Avg. Headings</th><th>Technical</th><th>On-Page</th><th>Overall</th></tr></thead>
          <tbody>
            <tr><td>Your site</td><td>${c.comparison.structural.yourSite.pageCount}</td><td>${escapeHtml(c.comparison.structural.yourSite.avgWordCount !== null ? String(c.comparison.structural.yourSite.avgWordCount) : "—")}</td><td>${escapeHtml(c.comparison.structural.yourSite.avgHeadingCount !== null ? String(c.comparison.structural.yourSite.avgHeadingCount) : "—")}</td><td>${fmtScore(c.comparison.yourScores.technical.score)}</td><td>${fmtScore(c.comparison.yourScores.onPage.score)}</td><td>${fmtScore(c.comparison.yourScores.overall.score)}</td></tr>
            <tr><td>Competitor</td><td>${c.comparison.structural.competitor.pageCount}</td><td>${escapeHtml(c.comparison.structural.competitor.avgWordCount !== null ? String(c.comparison.structural.competitor.avgWordCount) : "—")}</td><td>${escapeHtml(c.comparison.structural.competitor.avgHeadingCount !== null ? String(c.comparison.structural.competitor.avgHeadingCount) : "—")}</td><td>${fmtScore(c.comparison.competitorScores.technical.score)}</td><td>${fmtScore(c.comparison.competitorScores.onPage.score)}</td><td>${fmtScore(c.comparison.competitorScores.overall.score)}</td></tr>
          </tbody>
        </table>
        <p><strong>Issues only your site has:</strong> ${c.comparison.structural.issuesOnlyYouHave.map(escapeHtml).join(", ") || "none"}</p>
        <p><strong>Issues only the competitor has:</strong> ${c.comparison.structural.issuesOnlyCompetitorHas.map(escapeHtml).join(", ") || "none"}</p>
      `
          )
          .join("\n")
      : `<p class="not-available">No competitor is registered against this website yet.</p>`;

  const aiInferredSection = `
    <p class="ai-disclaimer">${escapeHtml(report.aiInferred.disclaimer)}</p>
    ${
      report.aiInferred.pageAssessments.length > 0
        ? `<table class="data-table"><thead><tr><th>Page</th><th>Answerability</th><th>Semantic Completeness</th><th>Direct Answers</th><th>Answer Completeness</th></tr></thead>
           <tbody>${report.aiInferred.pageAssessments
             .map(
               (a) =>
                 `<tr><td>${escapeHtml(a.pageUrl)}</td><td>${escapeHtml(fmtScore(a.answerability?.score ?? null))}</td><td>${escapeHtml(fmtScore(a.semanticCompleteness?.score ?? null))}</td><td>${escapeHtml(fmtScore(a.directAnswers?.score ?? null))}</td><td>${escapeHtml(fmtScore(a.answerCompleteness?.score ?? null))}</td></tr>`
             )
             .join("")}</tbody></table>`
        : `<p class="not-available">No completed AI-inferred page assessments (Phase 29) exist for this website's most recent crawl.</p>`
    }
    ${
      report.aiInferred.contentGapAnalyses.length > 0
        ? report.aiInferred.contentGapAnalyses
            .map(
              (g) => `
          <h4>vs. ${escapeHtml(g.competitorName)}</h4>
          <p>${escapeHtml(g.summary ?? "")}</p>
          <ul>${g.gaps.map((gap) => `<li><strong>${escapeHtml(gap.topic)}:</strong> ${escapeHtml(gap.description)} <em>(${escapeHtml(gap.evidence)})</em></li>`).join("")}</ul>`
            )
            .join("\n")
        : `<p class="not-available">No completed AI-inferred content-gap analyses exist for any registered competitor.</p>`
    }
  `;

  const retestSection = report.retest.available
    ? (() => {
        const c = report.retest.comparison!;
        const fmtDelta = (d: { before: number | null; after: number | null; delta: number | null }) =>
          `${fmtScore(d.before)} → ${fmtScore(d.after)} (${d.delta === null ? "not comparable" : d.delta > 0 ? `+${d.delta}` : String(d.delta)})`;
        return `
        <p><strong>${escapeHtml(c.verdict.summary)}</strong></p>
        <table class="data-table">
          <thead><tr><th>Metric</th><th>Before → After (delta)</th></tr></thead>
          <tbody>
            <tr><td>Overall score</td><td>${escapeHtml(fmtDelta(c.scoreDeltas.overall))}</td></tr>
            <tr><td>Technical score</td><td>${escapeHtml(fmtDelta(c.scoreDeltas.technical))}</td></tr>
            <tr><td>On-page score</td><td>${escapeHtml(fmtDelta(c.scoreDeltas.onPage))}</td></tr>
            <tr><td>Performance score</td><td>${escapeHtml(fmtDelta(c.scoreDeltas.performance))}</td></tr>
            <tr><td>LCP (ms, lower is better)</td><td>${escapeHtml(fmtDelta(c.coreWebVitalsDeltas.lcp))}</td></tr>
            <tr><td>CLS (lower is better)</td><td>${escapeHtml(fmtDelta(c.coreWebVitalsDeltas.cls))}</td></tr>
            <tr><td>INP (ms, lower is better)</td><td>${escapeHtml(fmtDelta(c.coreWebVitalsDeltas.inp))}</td></tr>
            <tr><td>Total issues</td><td>${escapeHtml(fmtDelta({ before: c.issueCountDeltas.before.total, after: c.issueCountDeltas.after.total, delta: c.issueCountDeltas.totalDelta }))}</td></tr>
          </tbody>
        </table>
        <p>${c.ruleKeyDiff.newIssueRuleCount} new issue(s) introduced, ${c.ruleKeyDiff.resolvedIssueRuleCount} issue(s) resolved, ${c.ruleKeyDiff.persistedIssueRuleCount} issue(s) persisted.</p>
        ${
          c.ruleKeyDiff.appeared.length > 0
            ? `<h4>New issues</h4><ul>${c.ruleKeyDiff.appeared.map((e) => `<li>${escapeHtml(e.title)} (${escapeHtml(e.severity)}, ${e.afterAffectedPageCount} page(s))</li>`).join("")}</ul>`
            : ""
        }
        ${
          c.ruleKeyDiff.disappeared.length > 0
            ? `<h4>Resolved issues</h4><ul>${c.ruleKeyDiff.disappeared.map((e) => `<li>${escapeHtml(e.title)} (was ${escapeHtml(e.severity)}, ${e.beforeAffectedPageCount} page(s))</li>`).join("")}</ul>`
            : ""
        }`;
      })()
    : `<p class="not-available">${escapeHtml(report.retest.reason ?? "Not available.")}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SEO Report — ${escapeHtml(w.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 0; background: #f8fafc; color: #0f172a; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 32px 24px 80px; }
  header.report-header { border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
  header.report-header h1 { font-size: 26px; margin: 0 0 4px; }
  header.report-header .meta { color: #64748b; font-size: 13px; }
  section { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 20px; }
  section h2 { font-size: 18px; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  section h3 { font-size: 15px; margin: 16px 0 6px; }
  section h4 { font-size: 14px; margin: 14px 0 6px; color: #1e293b; }
  .disclaimer { font-size: 12px; color: #64748b; background: #f1f5f9; border-radius: 6px; padding: 8px 12px; margin: 8px 0 16px; }
  .scores-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .score-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .score-box .label { font-size: 12px; color: #64748b; }
  .score-box .value { font-size: 26px; font-weight: 700; color: #1d4ed8; }
  table.data-table, table.dim-table, table.counts-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
  table.data-table th, table.data-table td,
  table.dim-table th, table.dim-table td,
  table.counts-table th, table.counts-table td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  table.data-table th, table.dim-table th, table.counts-table th { background: #f1f5f9; }
  td.unassessed { color: #b45309; font-style: italic; }
  .rec-entry { border-left: 4px solid #94a3b8; padding: 8px 12px; margin: 8px 0; background: #f8fafc; border-radius: 4px; }
  .rec-critical { border-color: #dc2626; }
  .rec-high { border-color: #ea580c; }
  .rec-medium { border-color: #ca8a04; }
  .rec-low { border-color: #2563eb; }
  .rec-info { border-color: #64748b; }
  .rec-title { font-weight: 600; }
  .badge { display: inline-block; font-size: 11px; background: #e2e8f0; border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
  .rec-desc { font-size: 13px; color: #334155; margin: 4px 0; }
  .rec-fix { font-size: 12px; color: #475569; margin-top: 2px; }
  .tier-heading { padding: 4px 8px; border-radius: 4px; display: inline-block; }
  .not-available { color: #b45309; background: #fffbeb; border-radius: 6px; padding: 8px 12px; font-size: 13px; }
  .ai-section { border: 1px dashed #7c3aed; background: #faf5ff; }
  .ai-disclaimer { font-size: 12px; color: #6d28d9; }
  details.page-detail { margin: 8px 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
  details.page-detail summary { cursor: pointer; font-size: 13px; font-weight: 600; }
  footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
  @media print {
    body { background: #fff; }
    section { break-inside: avoid; border: 1px solid #cbd5e1; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="report-header">
    <h1>SEO &amp; AI-Search Audit Report</h1>
    <div class="meta">
      <strong>${escapeHtml(w.name)}</strong> — <a href="${escapeHtml(w.url)}">${escapeHtml(w.url)}</a><br />
      Generated ${escapeHtml(report.generatedAt)} ·
      ${report.crawl.hasCompletedCrawl ? `Based on crawl completed ${escapeHtml(report.crawl.completedAt ?? "")} (${report.crawl.pagesCrawled ?? 0} page(s))` : "No completed crawl exists yet for this website — sections below reflect that."}
    </div>
  </header>

  <section>
    <h2>Executive Summary — Overall Score</h2>
    <p class="disclaimer">${escapeHtml(report.disclaimers.scores)}</p>
    <div class="scores-grid">
      <div class="score-box"><div class="label">Overall</div><div class="value">${fmtScore(s.overall.score)}</div></div>
      <div class="score-box"><div class="label">Technical</div><div class="value">${fmtScore(s.technical.score)}</div></div>
      <div class="score-box"><div class="label">On-Page</div><div class="value">${fmtScore(s.onPage.score)}</div></div>
      <div class="score-box"><div class="label">Performance</div><div class="value">${fmtScore(s.performance.score)}</div></div>
    </div>
    <h3>Issues by category</h3>
    <table class="counts-table"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>${issueCountRows || "<tr><td colspan=2>No issues recorded.</td></tr>"}</tbody></table>
    <h3>Issues by severity</h3>
    <table class="counts-table"><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>${severityRows || "<tr><td colspan=2>No issues recorded.</td></tr>"}</tbody></table>
  </section>

  <section>
    <h2>Re-test — Before / After (most recent two completed crawls)</h2>
    ${retestSection}
  </section>

  <section>
    <h2>Recommendations by Priority</h2>
    <p class="disclaimer">${escapeHtml(report.disclaimers.recommendations)}</p>
    ${recommendationsHtml || "<p>No open recommendations — no issues detected in the most recent crawl.</p>"}
  </section>

  <section>
    <h2>AI Search Readiness (GEO / AEO / AI Overview)</h2>
    <p class="disclaimer">${escapeHtml(report.disclaimers.aiSearch)}</p>
    <div class="scores-grid">
      <div class="score-box"><div class="label">GEO</div><div class="value">${fmtScore(report.aiSearch.geo)}</div></div>
      <div class="score-box"><div class="label">AEO</div><div class="value">${fmtScore(report.aiSearch.aeo)}</div></div>
      <div class="score-box"><div class="label">AI Overview</div><div class="value">${fmtScore(report.aiSearch.aio)}</div></div>
      <div class="score-box"><div class="label">Pages assessed</div><div class="value">${report.aiSearch.pagesAssessed}</div></div>
    </div>
    <p>Per-page dimension breakdown (unassessed dimensions are explicitly labeled "Not measured", never omitted or scored as zero):</p>
    ${perPageAiSearch || "<p>No pages assessed.</p>"}
  </section>

  <section>
    <h2>E-E-A-T / Trust</h2>
    <p class="disclaimer">${escapeHtml(report.disclaimers.eeat)}</p>
    <div class="scores-grid">
      <div class="score-box"><div class="label">Trust Score</div><div class="value">${fmtScore(report.eeat.score)}</div></div>
      <div class="score-box"><div class="label">About page</div><div class="value">${fmtScore(findDim(report.eeat.dimensions, "aboutPage"))}</div></div>
      <div class="score-box"><div class="label">Contact page</div><div class="value">${fmtScore(findDim(report.eeat.dimensions, "contactPage"))}</div></div>
      <div class="score-box"><div class="label">Privacy page</div><div class="value">${fmtScore(findDim(report.eeat.dimensions, "privacyPage"))}</div></div>
    </div>
    <h3>Author &amp; Date Signal (content-heavy pages)</h3>
    <table class="data-table"><thead><tr><th>Page</th><th>Word count</th><th>Score</th><th>Evidence</th></tr></thead>
    <tbody>${eeatPages || `<tr><td colspan=4>No content-heavy pages (300+ words) were assessed.</td></tr>`}</tbody></table>
  </section>

  <section>
    <h2>Performance (PageSpeed / Lighthouse)</h2>
    ${pagespeedSection}
  </section>

  <section>
    <h2>Google Search Console</h2>
    ${gscSection}
  </section>

  <section>
    <h2>Tracked Keywords</h2>
    ${keywordsSection}
  </section>

  <section>
    <h2>Competitor Comparison</h2>
    ${competitorsSection}
  </section>

  <section class="ai-section">
    <h2>AI-Inferred Findings (Phase 29 — Local AI)</h2>
    ${aiInferredSection}
  </section>

  <footer>Generated by the AI SEO Intelligence Platform. Proprietary scores; not an official Google or AI-provider ranking metric. No guaranteed ranking or AI-visibility outcome is implied by any figure in this report.</footer>
</div>
</body>
</html>`;
}
