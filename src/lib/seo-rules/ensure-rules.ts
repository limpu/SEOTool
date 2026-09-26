import { db } from "@/lib/db";
import { seoRules } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { ALL_RULES } from "./rules";

/**
 * Upserts every rule in the registry into `seo_rules` and returns a
 * ruleKey -> id map for the analyzer to attach issues to. Idempotent and
 * cheap (~40 rows) — called at the start of each analysis pass rather than
 * requiring a separate seed step to remember to run.
 */
export async function ensureSeoRules(): Promise<Map<string, string>> {
  for (const rule of ALL_RULES) {
    await db
      .insert(seoRules)
      .values({
        ruleKey: rule.ruleKey,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        recommendation: rule.recommendation,
        fixExample: rule.fixExample,
        impact: rule.impact,
      })
      .onConflictDoUpdate({
        target: seoRules.ruleKey,
        set: {
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          recommendation: rule.recommendation,
          fixExample: rule.fixExample,
          impact: rule.impact,
        },
      });
  }

  const keys = ALL_RULES.map((r) => r.ruleKey);
  const rows = await db
    .select({ id: seoRules.id, ruleKey: seoRules.ruleKey })
    .from(seoRules)
    .where(inArray(seoRules.ruleKey, keys));

  return new Map(rows.map((r) => [r.ruleKey, r.id]));
}
