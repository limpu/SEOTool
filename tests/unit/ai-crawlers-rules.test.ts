import { describe, it, expect } from "vitest";
import { evaluateAiCrawlerIssues } from "@/lib/seo-rules/ai-crawlers";
import type { RobotsRules, RobotsGroup } from "@/lib/crawler/robots";

function robotsRules(rawGroups: RobotsGroup[], found = true): RobotsRules {
  return { rules: [], sitemaps: [], found, syntaxWarnings: [], aiCrawlerGroups: [], rawGroups };
}

function keys(r: RobotsRules) {
  return evaluateAiCrawlerIssues(r).map((v) => v.ruleKey);
}

describe("evaluateAiCrawlerIssues", () => {
  it("produces no violations when nothing is blocked", () => {
    expect(keys(robotsRules([{ agents: ["*"], rules: [] }]))).toEqual([]);
  });

  it("flags AI_CRAWLER_BLOCKED when a known crawler's dedicated group fully disallows it", () => {
    const groups: RobotsGroup[] = [
      { agents: ["*"], rules: [] },
      { agents: ["gptbot"], rules: [{ path: "/", allow: false }] },
    ];
    expect(keys(robotsRules(groups))).toContain("AI_CRAWLER_BLOCKED");
  });

  it("flags AI_CRAWLER_PARTIALLY_BLOCKED when a known crawler is disallowed on some paths only", () => {
    const groups: RobotsGroup[] = [{ agents: ["gptbot"], rules: [{ path: "/private", allow: false }] }];
    expect(keys(robotsRules(groups))).toContain("AI_CRAWLER_PARTIALLY_BLOCKED");
  });

  it("does not flag anything when the wildcard group blocks everyone but is inapplicable (found: false)", () => {
    // With no robots.txt found, every crawler is "unknown", not "blocked" — no issue should fire.
    expect(keys(robotsRules([], false))).toEqual([]);
  });

  it("names the specific blocked crawlers in the evidence", () => {
    const groups: RobotsGroup[] = [
      { agents: ["*"], rules: [] },
      { agents: ["gptbot"], rules: [{ path: "/", allow: false }] },
    ];
    const violations = evaluateAiCrawlerIssues(robotsRules(groups));
    const blocked = violations.find((v) => v.ruleKey === "AI_CRAWLER_BLOCKED");
    expect(blocked?.evidence).toContain("GPTBot");
  });
});
