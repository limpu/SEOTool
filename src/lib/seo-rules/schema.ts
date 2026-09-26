import type { ExtractedSchema } from "@/lib/crawler/extract";
import type { RuleViolation } from "./on-page";
import { SCHEMA_REQUIRED_PROPERTIES, SINGULAR_SCHEMA_TYPES } from "./schema-requirements";

/** Types whose `url` property is expected to point back at this site. */
const URL_CONSISTENCY_TYPES = new Set(["Organization", "WebSite", "WebPage"]);

function getStringProp(entity: unknown, key: string): string | null {
  if (!entity || typeof entity !== "object") return null;
  const value = (entity as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/**
 * Evaluates JSON-LD/Microdata/RDFa issues for one page's structured data.
 * Organization-name cross-page consistency is separate (see
 * `evaluateOrganizationConsistency`) since it needs every page's data.
 */
export function evaluateSchemaIssues(
  schemas: ExtractedSchema[],
  pageUrl: string,
  siteHostname: string
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const jsonLd = schemas.filter((s) => s.format === "json-ld");

  for (const schema of jsonLd) {
    if (!schema.isValid) {
      violations.push({
        ruleKey: "SCHEMA_INVALID_JSON",
        evidence: schema.errors[0] ?? "Invalid JSON-LD.",
      });
      continue;
    }

    if (!schema.schemaType) {
      violations.push({ ruleKey: "SCHEMA_MISSING_TYPE", evidence: "JSON-LD entity has no @type." });
      continue;
    }

    const required = SCHEMA_REQUIRED_PROPERTIES[schema.schemaType];
    if (required) {
      const missing = required.filter((prop) => !(schema.rawJson && typeof schema.rawJson === "object" && prop in (schema.rawJson as Record<string, unknown>)));
      if (missing.length > 0) {
        violations.push({
          ruleKey: "SCHEMA_MISSING_REQUIRED_PROPERTY",
          evidence: `${schema.schemaType} is missing: ${missing.join(", ")}`,
        });
      }
    }

    if (URL_CONSISTENCY_TYPES.has(schema.schemaType)) {
      const url = getStringProp(schema.rawJson, "url");
      if (url) {
        try {
          const schemaHost = new URL(url, pageUrl).hostname.toLowerCase();
          if (schemaHost !== siteHostname.toLowerCase()) {
            violations.push({
              ruleKey: "SCHEMA_URL_MISMATCH",
              evidence: `${schema.schemaType} schema url (${url}) points to ${schemaHost}, not ${siteHostname}.`,
            });
          }
        } catch {
          // Unparsable schema URL — not worth a separate rule in this phase's scope.
        }
      }
    }
  }

  const typeCounts = new Map<string, number>();
  for (const schema of jsonLd) {
    if (!schema.schemaType || !SINGULAR_SCHEMA_TYPES.has(schema.schemaType)) continue;
    typeCounts.set(schema.schemaType, (typeCounts.get(schema.schemaType) ?? 0) + 1);
  }
  for (const [type, count] of typeCounts) {
    if (count > 1) {
      violations.push({
        ruleKey: "SCHEMA_DUPLICATE_TYPE",
        evidence: `${type} schema appears ${count} times on this page.`,
      });
    }
  }

  return violations;
}

export interface PageIssueRef {
  pageId: string;
  ruleKey: string;
  evidence: string;
}

export interface OrganizationNameEntry {
  pageId: string;
  organizationName: string;
}

/**
 * Flags pages whose Organization schema name differs from another
 * crawled page's Organization schema name — the same site should present
 * one consistent organization identity across its structured data.
 */
export function evaluateOrganizationConsistency(entries: OrganizationNameEntry[]): PageIssueRef[] {
  const distinctNames = new Set(entries.map((e) => e.organizationName));
  if (distinctNames.size <= 1) return [];

  return entries.map((e) => ({
    pageId: e.pageId,
    ruleKey: "SCHEMA_ORGANIZATION_NAME_INCONSISTENT",
    evidence: `This page's Organization name is "${e.organizationName}"; other pages use a different name.`,
  }));
}
