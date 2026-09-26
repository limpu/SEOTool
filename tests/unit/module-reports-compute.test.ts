import { describe, it, expect } from "vitest";
import { matchesModule, type ModuleKey } from "@/lib/module-reports/compute";

const ALL_MODULES: ModuleKey[] = [
  "technical",
  "on_page",
  "schema",
  "sitemap",
  "robots",
  // Stage 3A
  "pagespeed",
  "ai_search",
  "eeat",
];

function onlyMatching(ruleKey: string): ModuleKey[] {
  return ALL_MODULES.filter((m) => matchesModule(ruleKey, m));
}

describe("matchesModule", () => {
  it("routes TECH_ rules to technical only, excluding sitemap/robots", () => {
    expect(onlyMatching("TECH_NOT_HTTPS")).toEqual(["technical"]);
  });

  it("routes ONPAGE_ rules to on_page only", () => {
    expect(onlyMatching("ONPAGE_TITLE_MISSING")).toEqual(["on_page"]);
  });

  it("routes SCHEMA_ rules to schema only", () => {
    expect(onlyMatching("SCHEMA_INVALID_JSON")).toEqual(["schema"]);
  });

  it("routes SITEMAP_ rules to sitemap only, not technical", () => {
    expect(onlyMatching("SITEMAP_HTTP_ERROR")).toEqual(["sitemap"]);
  });

  it("routes ROBOTS_ rules to robots only, not technical", () => {
    expect(onlyMatching("ROBOTS_DISALLOW_ALL")).toEqual(["robots"]);
  });

  it("every real rule key prefix in the registries matches exactly one module", () => {
    const keys = [
      "TECH_ORPHAN_PAGE",
      "ONPAGE_META_DESCRIPTION_MISSING",
      "SCHEMA_MISSING_TYPE",
      "SITEMAP_INVALID_XML",
      "ROBOTS_HOMEPAGE_BLOCKED",
    ];
    for (const key of keys) {
      expect(onlyMatching(key).length).toBe(1);
    }
  });

  it("an unrecognized prefix matches no module", () => {
    expect(onlyMatching("UNKNOWN_RULE")).toEqual([]);
  });
});
