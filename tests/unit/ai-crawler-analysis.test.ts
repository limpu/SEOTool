import { describe, it, expect } from "vitest";
import { analyzeAiCrawlerAccess, computeAiCrawlerVerdict } from "@/lib/crawler/ai-crawler-analysis";
import type { RobotsRules, RobotsGroup } from "@/lib/crawler/robots";
import { AI_CRAWLER_REGISTRY } from "@/lib/crawler/ai-crawler-registry";

const GPTBOT = AI_CRAWLER_REGISTRY.find((c) => c.userAgent === "gptbot")!;
const PERPLEXITY = AI_CRAWLER_REGISTRY.find((c) => c.userAgent === "perplexitybot")!;

function robotsRules(rawGroups: RobotsGroup[], found = true): RobotsRules {
  return {
    rules: [],
    sitemaps: [],
    found,
    syntaxWarnings: [],
    aiCrawlerGroups: [],
    rawGroups,
  };
}

describe("computeAiCrawlerVerdict", () => {
  it("returns unknown when robots.txt was not found, but explains the default-allow convention", () => {
    const verdict = computeAiCrawlerVerdict(robotsRules([], false), GPTBOT);
    expect(verdict.status).toBe("unknown");
    expect(verdict.matchedGroup).toBe("none");
    expect(verdict.evidence).toMatch(/unrestricted by default/);
  });

  it("returns allowed when no group applies at all", () => {
    const verdict = computeAiCrawlerVerdict(robotsRules([]), GPTBOT);
    expect(verdict.status).toBe("allowed");
    expect(verdict.matchedGroup).toBe("none");
  });

  it("returns allowed when the wildcard group has no Disallow rules", () => {
    const groups: RobotsGroup[] = [{ agents: ["*"], rules: [{ path: "/public", allow: true }] }];
    const verdict = computeAiCrawlerVerdict(robotsRules(groups), GPTBOT);
    expect(verdict.status).toBe("allowed");
    expect(verdict.matchedGroup).toBe("wildcard");
  });

  it("returns blocked with exact directive evidence for a full-site Disallow in a dedicated group", () => {
    const groups: RobotsGroup[] = [
      { agents: ["*"], rules: [] },
      { agents: ["gptbot"], rules: [{ path: "/", allow: false }] },
    ];
    const verdict = computeAiCrawlerVerdict(robotsRules(groups), GPTBOT);
    expect(verdict.status).toBe("blocked");
    expect(verdict.matchedGroup).toBe("dedicated");
    expect(verdict.evidence).toContain("Disallow: /");
  });

  it("returns partial when some paths are disallowed and others remain allowed", () => {
    const groups: RobotsGroup[] = [{ agents: ["gptbot"], rules: [{ path: "/private", allow: false }] }];
    const verdict = computeAiCrawlerVerdict(robotsRules(groups), GPTBOT);
    expect(verdict.status).toBe("partial");
    expect(verdict.evidence).toContain("Disallow: /private");
  });

  it("falls back to the wildcard group when no dedicated group exists for the crawler", () => {
    const groups: RobotsGroup[] = [{ agents: ["*"], rules: [{ path: "/", allow: false }] }];
    const verdict = computeAiCrawlerVerdict(robotsRules(groups), PERPLEXITY);
    expect(verdict.status).toBe("blocked");
    expect(verdict.matchedGroup).toBe("wildcard");
  });

  it("does not let a dedicated group for one crawler affect another crawler's verdict", () => {
    const groups: RobotsGroup[] = [
      { agents: ["*"], rules: [] },
      { agents: ["gptbot"], rules: [{ path: "/", allow: false }] },
    ];
    const verdict = computeAiCrawlerVerdict(robotsRules(groups), PERPLEXITY);
    expect(verdict.status).toBe("allowed");
    expect(verdict.matchedGroup).toBe("wildcard");
  });
});

describe("analyzeAiCrawlerAccess", () => {
  it("returns one verdict per registry crawler", () => {
    const verdicts = analyzeAiCrawlerAccess(robotsRules([]));
    expect(verdicts.length).toBe(AI_CRAWLER_REGISTRY.length);
    expect(verdicts.every((v) => ["allowed", "blocked", "partial", "unknown"].includes(v.status))).toBe(true);
  });

  it("carries registry metadata (provider, purpose, confidence) through to the verdict", () => {
    const verdicts = analyzeAiCrawlerAccess(robotsRules([]));
    const gptbot = verdicts.find((v) => v.userAgent === "gptbot")!;
    expect(gptbot.provider).toBe("OpenAI");
    expect(gptbot.purposeConfidence).toBeDefined();
  });
});
