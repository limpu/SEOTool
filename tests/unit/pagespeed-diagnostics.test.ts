import { describe, it, expect } from "vitest";
import { evaluatePageSpeedDiagnostics, type DiagnosticAuditsMap } from "@/lib/pagespeed/diagnostics";

/**
 * Fixture shapes below are modeled directly on real Lighthouse audit output
 * captured from a live `lighthouse()` run against a real page during this
 * phase's implementation (https://en.wikipedia.org/wiki/Web_performance,
 * desktop strategy) — not guessed. See read.md's Phase 21 write-up for the
 * live-run evidence this mirrors (unused-javascript wastedBytes, unused-css
 * -rules wastedBytes, mainthread-work-breakdown groupLabel/duration shape,
 * bootup-time total/scripting/scriptParseCompile shape).
 */

describe("evaluatePageSpeedDiagnostics", () => {
  it("returns no signals for an empty/absent audits map", () => {
    expect(evaluatePageSpeedDiagnostics({})).toEqual([]);
  });

  it("ignores audits that are present but scored 1 (fully passing) even with items", () => {
    const audits: DiagnosticAuditsMap = {
      "unused-javascript": {
        score: 1,
        details: { items: [{ url: "https://example.com/a.js", wastedBytes: 100, wastedPercent: 1 }] },
      },
    };
    expect(evaluatePageSpeedDiagnostics(audits)).toEqual([]);
  });

  it("ignores audits with no items even if score < 1", () => {
    const audits: DiagnosticAuditsMap = {
      "unused-javascript": { score: 0.5, details: { items: [] } },
    };
    expect(evaluatePageSpeedDiagnostics(audits)).toEqual([]);
  });

  it("extracts an LCP element signal when identified, independent of score", () => {
    const audits: DiagnosticAuditsMap = {
      "largest-contentful-paint-element": {
        details: { items: [{ node: { selector: "div.hero > img", snippet: "<img class=hero>" } }] },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    expect(signals).toHaveLength(1);
    expect(signals[0].ruleKey).toBe("PAGESPEED_LCP_ELEMENT_IDENTIFIED");
    expect(signals[0].evidence).toContain("div.hero > img");
  });

  it("flags a lazy-loaded LCP element", () => {
    const audits: DiagnosticAuditsMap = {
      "lcp-lazy-loaded": { score: 0, details: { items: [{}] } },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    expect(signals.map((s) => s.ruleKey)).toContain("PAGESPEED_LCP_LAZY_LOADED");
    expect(signals[0].evidence).toContain("loading=\"lazy\"");
  });

  it("extracts CLS-causing elements with their shift contribution", () => {
    const audits: DiagnosticAuditsMap = {
      "layout-shift-elements": {
        details: {
          items: [
            { node: { selector: "#banner" }, score: 0.084 },
            { node: { selector: ".ad-slot" }, score: 0.021 },
          ],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    expect(signals).toHaveLength(1);
    expect(signals[0].ruleKey).toBe("PAGESPEED_CLS_ELEMENTS_IDENTIFIED");
    expect(signals[0].evidence).toContain("#banner");
    expect(signals[0].evidence).toContain("0.084");
  });

  it("reports long tasks with the worst offender's URL and duration", () => {
    const audits: DiagnosticAuditsMap = {
      "long-tasks": {
        details: {
          items: [
            { url: "https://example.com/vendor.js", startTime: 100, duration: 62 },
            { url: "https://example.com/app.js", startTime: 300, duration: 210 },
          ],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const longTasks = signals.find((s) => s.ruleKey === "PAGESPEED_LONG_TASKS");
    expect(longTasks).toBeDefined();
    expect(longTasks!.evidence).toContain("app.js");
    expect(longTasks!.evidence).toContain("210ms");
    expect(longTasks!.evidence).toContain("2 long main-thread task");
  });

  it("reports main-thread work breakdown by worst category (real-shaped fixture)", () => {
    const audits: DiagnosticAuditsMap = {
      "mainthread-work-breakdown": {
        score: 0.6,
        displayValue: "2.1 s",
        numericValue: 2100,
        details: {
          items: [
            { group: "scriptEvaluation", groupLabel: "Script Evaluation", duration: 1400 },
            { group: "styleLayout", groupLabel: "Style & Layout", duration: 400 },
          ],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const mainThread = signals.find((s) => s.ruleKey === "PAGESPEED_MAINTHREAD_WORK_HIGH");
    expect(mainThread).toBeDefined();
    expect(mainThread!.evidence).toContain("Script Evaluation");
    expect(mainThread!.evidence).toContain("1400ms");
  });

  it("reports bootup-time's heaviest script (real-shaped fixture)", () => {
    const audits: DiagnosticAuditsMap = {
      "bootup-time": {
        score: 0.4,
        displayValue: "1.8 s",
        details: {
          items: [
            { url: "https://example.com/main.js", total: 1800, scripting: 1200, scriptParseCompile: 300 },
            { url: "https://example.com/vendor.js", total: 400, scripting: 350, scriptParseCompile: 20 },
          ],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const bootup = signals.find((s) => s.ruleKey === "PAGESPEED_JS_BOOTUP_HIGH");
    expect(bootup).toBeDefined();
    expect(bootup!.evidence).toContain("main.js");
    expect(bootup!.evidence).toContain("1800ms");
  });

  it("reports unused JavaScript with real wastedBytes/wastedPercent shape", () => {
    const audits: DiagnosticAuditsMap = {
      "unused-javascript": {
        score: 0.5,
        displayValue: "Est savings of 79 KiB",
        details: {
          items: [{ url: "https://en.wikipedia.org/w/load.php?...", totalBytes: 229110, wastedBytes: 81320, wastedPercent: 35.49 }],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const unused = signals.find((s) => s.ruleKey === "PAGESPEED_JS_UNUSED");
    expect(unused).toBeDefined();
    expect(unused!.evidence).toContain("79KB");
    expect(unused!.evidence).toContain("35%");
  });

  it("reports unminified JavaScript", () => {
    const audits: DiagnosticAuditsMap = {
      "unminified-javascript": {
        score: 0.7,
        details: { items: [{ url: "https://example.com/app.js", wastedBytes: 12000 }] },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    expect(signals.find((s) => s.ruleKey === "PAGESPEED_JS_UNMINIFIED")).toBeDefined();
  });

  it("reports unused CSS with real wastedBytes/wastedPercent shape", () => {
    const audits: DiagnosticAuditsMap = {
      "unused-css-rules": {
        score: 0.5,
        displayValue: "Est savings of 25 KiB",
        details: {
          items: [{ url: ".mw-spinner{...}", wastedBytes: 26021, wastedPercent: 94.82, totalBytes: 27442 }],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const unusedCss = signals.find((s) => s.ruleKey === "PAGESPEED_CSS_UNUSED");
    expect(unusedCss).toBeDefined();
    expect(unusedCss!.evidence).toContain("25KB");
  });

  it("reports unminified CSS", () => {
    const audits: DiagnosticAuditsMap = {
      "unminified-css": { score: 0.6, details: { items: [{ url: "https://example.com/style.css", wastedBytes: 5000 }] } },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    expect(signals.find((s) => s.ruleKey === "PAGESPEED_CSS_UNMINIFIED")).toBeDefined();
  });

  it("reports render-blocking resources with total wasted time", () => {
    const audits: DiagnosticAuditsMap = {
      "render-blocking-resources": {
        score: 0.3,
        details: {
          items: [
            { url: "https://example.com/style.css", wastedMs: 300 },
            { url: "https://example.com/blocking.js", wastedMs: 500 },
          ],
        },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const rb = signals.find((s) => s.ruleKey === "PAGESPEED_RENDER_BLOCKING_RESOURCES");
    expect(rb).toBeDefined();
    expect(rb!.evidence).toContain("blocking.js");
    expect(rb!.evidence).toContain("800ms");
  });

  it("reports fonts missing font-display", () => {
    const audits: DiagnosticAuditsMap = {
      "font-display": {
        score: 0,
        details: { items: [{ url: "https://example.com/fonts/brand.woff2", wastedMs: 100 }] },
      },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const font = signals.find((s) => s.ruleKey === "PAGESPEED_FONT_DISPLAY_MISSING");
    expect(font).toBeDefined();
    expect(font!.evidence).toContain("brand.woff2");
  });

  it("combines signals across all categories for a rich fixture", () => {
    const audits: DiagnosticAuditsMap = {
      "lcp-lazy-loaded": { score: 0, details: { items: [{}] } },
      "layout-shift-elements": { details: { items: [{ node: { selector: "#x" }, score: 0.05 }] } },
      "long-tasks": { details: { items: [{ url: "a.js", duration: 60 }] } },
      "unused-javascript": { score: 0.5, details: { items: [{ url: "b.js", wastedBytes: 50000, wastedPercent: 40 }] } },
      "unused-css-rules": { score: 0.5, details: { items: [{ url: "c.css", wastedBytes: 20000, wastedPercent: 80 }] } },
      "font-display": { score: 0, details: { items: [{ url: "d.woff2" }] } },
    };
    const signals = evaluatePageSpeedDiagnostics(audits);
    const keys = signals.map((s) => s.ruleKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "PAGESPEED_LCP_LAZY_LOADED",
        "PAGESPEED_CLS_ELEMENTS_IDENTIFIED",
        "PAGESPEED_LONG_TASKS",
        "PAGESPEED_JS_UNUSED",
        "PAGESPEED_CSS_UNUSED",
        "PAGESPEED_FONT_DISPLAY_MISSING",
      ])
    );
  });
});
