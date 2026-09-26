import { describe, expect, it } from "vitest";

import {
  MODULE_DEFINITIONS,
  MODULE_KEYS,
  OTHER_TOPIC_KEY,
  OTHER_TOPIC_LABEL,
  moduleBySlug,
  moduleReportTabs,
  topicForRuleKey,
  topicLabel,
} from "@/components/report/module-definitions";
import { matchesModule, type ModuleKey } from "@/lib/module-reports/compute";
import { ALL_RULES } from "@/lib/seo-rules/rules";

/**
 * Stage 2 — the topic vocabulary each of the five issue-based module reports
 * facets on.
 *
 * The important tests here are the two that check the config against the REAL
 * rule registries rather than against itself: a hand-maintained lookup table
 * that silently drifts out of sync with the rules it classifies is exactly the
 * failure mode this file exists to prevent.
 */
describe("module definitions", () => {
  it("covers all eight module keys with unique, URL-safe slugs", () => {
    expect([...MODULE_KEYS].sort()).toEqual([
      "ai_search",
      "eeat",
      "on_page",
      "pagespeed",
      "robots",
      "schema",
      "sitemap",
      "technical",
    ]);

    const slugs = MODULE_KEYS.map((key) => MODULE_DEFINITIONS[key].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  /**
   * Stage 3A regression guard. The AI Search sidebar entry has always lived at
   * `/websites/[id]/ai-overview`, and `requireWorkspacePage` resolves the
   * feature key from this slug. Renaming it to match the module key would 404
   * the existing route AND break its permission lookup, so the mismatch is
   * deliberate and pinned here.
   */
  it("keeps AI Search on its existing `ai-overview` route slug", () => {
    expect(MODULE_DEFINITIONS.ai_search.slug).toBe("ai-overview");
    expect(moduleBySlug("ai-overview")?.key).toBe("ai_search");
    expect(moduleBySlug("ai_search")).toBeUndefined();
    expect(moduleBySlug("ai-search")).toBeUndefined();
  });

  it("keys every definition by its own module key", () => {
    for (const key of MODULE_KEYS) expect(MODULE_DEFINITIONS[key].key).toBe(key);
  });

  it("resolves a definition from its route slug, and nothing from an unknown one", () => {
    expect(moduleBySlug("on-page")?.key).toBe("on_page");
    expect(moduleBySlug("robots")?.key).toBe("robots");
    expect(moduleBySlug("site-audit")).toBeUndefined();
    expect(moduleBySlug("")).toBeUndefined();
  });

  it("gives every topic a unique, URL-safe key within its module", () => {
    for (const key of MODULE_KEYS) {
      const topicKeys = MODULE_DEFINITIONS[key].topics.map((topic) => topic.key);
      expect(new Set(topicKeys).size).toBe(topicKeys.length);
      for (const topicKey of topicKeys) {
        expect(topicKey).toMatch(/^[a-z0-9_]+$/);
        // `other` is the reserved fallback bucket and must not be declared.
        expect(topicKey).not.toBe(OTHER_TOPIC_KEY);
      }
    }
  });

  it("never lists the same rule key under two topics of one module", () => {
    for (const key of MODULE_KEYS) {
      const ruleKeys = MODULE_DEFINITIONS[key].topics.flatMap((topic) => topic.ruleKeys);
      expect(new Set(ruleKeys).size).toBe(ruleKeys.length);
    }
  });
});

describe("topic mapping against the real rule registries", () => {
  /**
   * The load-bearing test. Every rule that `computeWebsiteModuleReport` can
   * actually route into a module must be classified by that module's topic
   * table — otherwise it silently lands in "Other findings" in the live UI
   * and nobody notices until a user asks what "Other" means.
   */
  it("classifies every real rule that routes into each module", () => {
    const unclassified: string[] = [];

    for (const key of MODULE_KEYS) {
      for (const rule of ALL_RULES) {
        if (!matchesModule(rule.ruleKey, key as ModuleKey)) continue;
        if (topicForRuleKey(key, rule.ruleKey) === OTHER_TOPIC_KEY) {
          unclassified.push(`${key}: ${rule.ruleKey}`);
        }
      }
    }

    expect(unclassified).toEqual([]);
  });

  /** The other direction: no topic may name a rule key that does not exist. */
  it("names only rule keys that exist in the registries, and that route into that module", () => {
    const realKeys = new Set(ALL_RULES.map((rule) => rule.ruleKey));
    const bogus: string[] = [];
    const misrouted: string[] = [];

    for (const key of MODULE_KEYS) {
      for (const topic of MODULE_DEFINITIONS[key].topics) {
        for (const ruleKey of topic.ruleKeys) {
          if (!realKeys.has(ruleKey)) bogus.push(`${key}/${topic.key}: ${ruleKey}`);
          else if (!matchesModule(ruleKey, key as ModuleKey)) misrouted.push(`${key}/${topic.key}: ${ruleKey}`);
        }
      }
    }

    expect(bogus).toEqual([]);
    expect(misrouted).toEqual([]);
  });
});

describe("topicForRuleKey", () => {
  it("maps a known rule to its declared topic", () => {
    expect(topicForRuleKey("technical", "TECH_MISSING_HSTS")).toBe("security");
    expect(topicForRuleKey("technical", "TECH_REDIRECT_CHAIN_TOO_LONG")).toBe("redirects");
    expect(topicForRuleKey("on_page", "ONPAGE_TITLE_TOO_LONG")).toBe("titles");
    expect(topicForRuleKey("on_page", "ONPAGE_IMAGE_MISSING_ALT")).toBe("images");
    expect(topicForRuleKey("schema", "SCHEMA_INVALID_JSON")).toBe("validity");
    expect(topicForRuleKey("sitemap", "SITEMAP_URL_BROKEN")).toBe("cross_reference");
    expect(topicForRuleKey("robots", "ROBOTS_DISALLOW_ALL")).toBe("access");
    // Stage 3A
    expect(topicForRuleKey("pagespeed", "PAGESPEED_CWV_INP_FAIL")).toBe("core_web_vitals");
    expect(topicForRuleKey("pagespeed", "PAGESPEED_JS_UNUSED")).toBe("javascript");
    expect(topicForRuleKey("ai_search", "AEO_NO_FAQ_STRUCTURE")).toBe("answer_structure");
    expect(topicForRuleKey("ai_search", "GEO_NO_CITATION_LINKS")).toBe("generative_readiness");
    expect(topicForRuleKey("ai_search", "AI_CRAWLER_PARTIALLY_BLOCKED")).toBe("ai_crawler_access");
    expect(topicForRuleKey("ai_search", "LLMS_TXT_MISSING")).toBe("llms_txt");
    expect(topicForRuleKey("ai_search", "LLMS_FULL_TXT_HTTP_ERROR")).toBe("llms_full_txt");
    expect(topicForRuleKey("eeat", "EEAT_NO_ABOUT_PAGE")).toBe("trust_pages");
    expect(topicForRuleKey("eeat", "EEAT_NO_AUTHOR_BYLINE")).toBe("authorship");
  });

  /**
   * `LLMS_TXT_*` and `LLMS_FULL_TXT_*` share a prefix, and `LLMS_FULL_TXT_…`
   * also starts with `LLMS_TXT`-adjacent text. Exact-key matching is what
   * keeps the two topics apart; a substring rule would merge them.
   */
  it("keeps llms.txt and llms-full.txt in separate topics", () => {
    expect(topicForRuleKey("ai_search", "LLMS_TXT_HTTP_ERROR")).toBe("llms_txt");
    expect(topicForRuleKey("ai_search", "LLMS_FULL_TXT_WITHOUT_LLMS_TXT")).toBe("llms_full_txt");
  });

  it("falls back to the `other` bucket rather than throwing or guessing", () => {
    expect(topicForRuleKey("technical", "TECH_SOME_FUTURE_RULE")).toBe(OTHER_TOPIC_KEY);
    expect(topicForRuleKey("robots", "")).toBe(OTHER_TOPIC_KEY);
    // A rule from a different module cannot reach here in practice (the
    // compute layer has already filtered by prefix) but must still resolve.
    expect(topicForRuleKey("robots", "ONPAGE_TITLE_MISSING")).toBe(OTHER_TOPIC_KEY);
  });

  it("matches on the exact key, never on a prefix or substring", () => {
    // `TECH_NOT_HTTPS` is declared; a longer key that merely starts with it
    // must NOT inherit its topic.
    expect(topicForRuleKey("technical", "TECH_NOT_HTTPS")).toBe("security");
    expect(topicForRuleKey("technical", "TECH_NOT_HTTPS_EXTENDED")).toBe(OTHER_TOPIC_KEY);
  });
});

describe("topicLabel", () => {
  it("returns the declared label", () => {
    expect(topicLabel("on_page", "meta_descriptions")).toBe("Meta descriptions");
    expect(topicLabel("robots", "ai_crawlers")).toBe("AI crawlers");
  });

  it("labels the fallback bucket", () => {
    expect(topicLabel("schema", OTHER_TOPIC_KEY)).toBe(OTHER_TOPIC_LABEL);
  });

  it("echoes an unknown key rather than rendering an empty label", () => {
    expect(topicLabel("sitemap", "not_a_topic")).toBe("not_a_topic");
  });
});

describe("moduleReportTabs", () => {
  it("builds Overview + Issues under the module's own slug", () => {
    expect(moduleReportTabs("site-1", "on_page", 12)).toEqual([
      { label: "Overview", href: "/websites/site-1/on-page" },
      { label: "Issues", href: "/websites/site-1/on-page/issues", count: 12 },
    ]);
  });

  it("keeps a measured zero as a real 0, not an omitted badge", () => {
    const tabs = moduleReportTabs("site-1", "robots", 0);
    expect(tabs[1].count).toBe(0);
    expect(tabs[1].count).not.toBeUndefined();
  });
});
