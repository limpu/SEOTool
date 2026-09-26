import { ON_PAGE_RULES } from "./rules-registry";
import { TECHNICAL_RULES } from "./technical-rules-registry";
import { LINK_RULES } from "./link-rules-registry";
import { IMAGE_RULES } from "./image-rules-registry";
import { SCHEMA_RULES } from "./schema-rules-registry";
import { SITEMAP_RULES } from "./sitemap-rules-registry";
import { ROBOTS_RULES } from "./robots-rules-registry";
import { LLMS_RULES } from "./llms-rules-registry";
import { AI_CRAWLER_RULES } from "./ai-crawlers-rules-registry";
import { PAGESPEED_RULES } from "./pagespeed-rules-registry";
import { PAGESPEED_DIAGNOSTICS_RULES } from "./pagespeed-diagnostics-rules-registry";
import { AI_SEARCH_RULES } from "./ai-search-rules-registry";
import { EEAT_RULES } from "./eeat-rules-registry";
import type { RuleDefinition } from "./rules-registry";

export const ALL_RULES: RuleDefinition[] = [
  ...ON_PAGE_RULES,
  ...TECHNICAL_RULES,
  ...LINK_RULES,
  ...IMAGE_RULES,
  ...SCHEMA_RULES,
  ...SITEMAP_RULES,
  ...ROBOTS_RULES,
  ...LLMS_RULES,
  ...AI_CRAWLER_RULES,
  ...PAGESPEED_RULES,
  ...PAGESPEED_DIAGNOSTICS_RULES,
  ...AI_SEARCH_RULES,
  ...EEAT_RULES,
];
export const ALL_RULES_BY_KEY = new Map(ALL_RULES.map((r) => [r.ruleKey, r]));
