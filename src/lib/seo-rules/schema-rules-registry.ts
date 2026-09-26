import type { RuleDefinition } from "./rules-registry";

/**
 * Structured Data rules (Phase 11). Per Section 21's explicit caution: none
 * of these claim a schema type will produce a specific Google rich result
 * — eligibility depends on search-engine-specific guidelines this tool
 * doesn't track. These check structural correctness only.
 */
export const SCHEMA_RULES: RuleDefinition[] = [
  {
    ruleKey: "SCHEMA_INVALID_JSON",
    category: "schema",
    severity: "high",
    title: "Invalid JSON-LD",
    description: "A JSON-LD script block on this page contains invalid JSON.",
    recommendation: "Fix the JSON syntax error so the structured data can be parsed.",
    impact: "Search engines cannot read structured data that fails to parse as valid JSON.",
  },
  {
    ruleKey: "SCHEMA_MISSING_TYPE",
    category: "schema",
    severity: "medium",
    title: "Schema block missing @type",
    description: "A JSON-LD entity has no @type property.",
    recommendation: "Add an @type property identifying the schema.org type this entity represents.",
    impact: "Without @type, search engines can't identify what kind of entity this structured data describes.",
  },
  {
    ruleKey: "SCHEMA_MISSING_REQUIRED_PROPERTY",
    category: "schema",
    severity: "medium",
    title: "Schema missing a commonly required property",
    description: "A recognized schema type is missing one or more properties it typically needs to be useful.",
    recommendation: "Add the missing properties listed in the evidence.",
    impact: "Incomplete structured data is less likely to be used by search engines, even if technically valid.",
  },
  {
    ruleKey: "SCHEMA_DUPLICATE_TYPE",
    category: "schema",
    severity: "low",
    title: "Duplicate schema type on the same page",
    description: "A schema type that should normally appear once (e.g. Organization, WebSite, WebPage) appears more than once on this page.",
    recommendation: "Consolidate into a single schema block for this type, or verify the duplication is intentional.",
    impact: "Duplicate singular entities can create ambiguity about which one search engines should use.",
  },
  {
    ruleKey: "SCHEMA_URL_MISMATCH",
    category: "schema",
    severity: "medium",
    title: "Schema URL doesn't match the site",
    description: "A schema entity's url property points to a different domain than the page it's on.",
    recommendation: "Verify the schema's url property, or confirm the mismatch is intentional.",
    impact: "URL inconsistency between schema and the actual page can confuse entity resolution.",
  },
  {
    ruleKey: "SCHEMA_ORGANIZATION_NAME_INCONSISTENT",
    category: "schema",
    severity: "medium",
    title: "Organization name inconsistent across pages",
    description: "Organization schema on this page uses a different name than the same site's Organization schema on another crawled page.",
    recommendation: "Use one consistent Organization name across the site's structured data.",
    impact: "Inconsistent entity naming undermines the organization/knowledge-graph signal structured data is meant to provide.",
  },
];

export const SCHEMA_RULES_BY_KEY = new Map(SCHEMA_RULES.map((r) => [r.ruleKey, r]));
