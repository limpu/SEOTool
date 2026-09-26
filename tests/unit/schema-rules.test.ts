import { describe, it, expect } from "vitest";
import {
  evaluateSchemaIssues,
  evaluateOrganizationConsistency,
  type OrganizationNameEntry,
} from "@/lib/seo-rules/schema";
import { extractStructuredData } from "@/lib/crawler/extract";
import type { ExtractedSchema } from "@/lib/crawler/extract";

const PAGE_URL = "https://example.com/";
const HOSTNAME = "example.com";

function keys(schemas: ExtractedSchema[]) {
  return evaluateSchemaIssues(schemas, PAGE_URL, HOSTNAME).map((v) => v.ruleKey);
}

describe("extractStructuredData — JSON-LD", () => {
  it("parses a valid Organization block", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","name":"Acme","url":"https://example.com"}</script>`;
    const results = extractStructuredData(html);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ format: "json-ld", schemaType: "Organization", isValid: true });
  });

  it("flags invalid JSON", () => {
    const html = `<script type="application/ld+json">{not valid json}</script>`;
    const results = extractStructuredData(html);
    expect(results[0].isValid).toBe(false);
    expect(results[0].errors[0]).toMatch(/Invalid JSON/);
  });

  it("expands an @graph array into multiple entities", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Acme"},{"@type":"WebSite","name":"Acme Site"}]}</script>`;
    const results = extractStructuredData(html);
    expect(results.map((r) => r.schemaType).sort()).toEqual(["Organization", "WebSite"]);
  });

  it("warns when an entity has no @type", () => {
    const html = `<script type="application/ld+json">{"name":"No type here"}</script>`;
    const results = extractStructuredData(html);
    expect(results[0].schemaType).toBeNull();
    expect(results[0].warnings[0]).toMatch(/@type/);
  });
});

describe("extractStructuredData — Microdata and RDFa", () => {
  it("detects a top-level microdata entity and its type", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Widget</span></div>`;
    const results = extractStructuredData(html);
    expect(results).toContainEqual(expect.objectContaining({ format: "microdata", schemaType: "Product" }));
  });

  it("does not double-count a nested itemscope as a second top-level entity", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"><div itemscope itemtype="https://schema.org/Offer"></div></div>`;
    const results = extractStructuredData(html).filter((r) => r.format === "microdata");
    expect(results).toHaveLength(1);
    expect(results[0].schemaType).toBe("Product");
  });

  it("detects an RDFa typeof entity", () => {
    const html = `<div typeof="Organization"><span property="name">Acme</span></div>`;
    const results = extractStructuredData(html);
    expect(results).toContainEqual(expect.objectContaining({ format: "rdfa", schemaType: "Organization" }));
  });
});

describe("evaluateSchemaIssues", () => {
  it("produces no violations for a complete, consistent Organization schema", () => {
    const schemas: ExtractedSchema[] = [
      {
        format: "json-ld",
        schemaType: "Organization",
        rawJson: { "@type": "Organization", name: "Acme", url: "https://example.com" },
        isValid: true,
        errors: [],
        warnings: [],
      },
    ];
    expect(keys(schemas)).toEqual([]);
  });

  it("flags invalid JSON", () => {
    const schemas: ExtractedSchema[] = [
      { format: "json-ld", schemaType: null, rawJson: null, isValid: false, errors: ["bad json"], warnings: [] },
    ];
    expect(keys(schemas)).toContain("SCHEMA_INVALID_JSON");
  });

  it("flags a missing @type", () => {
    const schemas: ExtractedSchema[] = [
      { format: "json-ld", schemaType: null, rawJson: { name: "x" }, isValid: true, errors: [], warnings: ["no type"] },
    ];
    expect(keys(schemas)).toContain("SCHEMA_MISSING_TYPE");
  });

  it("flags missing required properties for a known type", () => {
    const schemas: ExtractedSchema[] = [
      {
        format: "json-ld",
        schemaType: "Article",
        rawJson: { "@type": "Article", headline: "Title only" },
        isValid: true,
        errors: [],
        warnings: [],
      },
    ];
    expect(keys(schemas)).toContain("SCHEMA_MISSING_REQUIRED_PROPERTY");
  });

  it("does not flag required properties for an unrecognized type", () => {
    const schemas: ExtractedSchema[] = [
      {
        format: "json-ld",
        schemaType: "SomeCustomType",
        rawJson: { "@type": "SomeCustomType" },
        isValid: true,
        errors: [],
        warnings: [],
      },
    ];
    expect(keys(schemas)).not.toContain("SCHEMA_MISSING_REQUIRED_PROPERTY");
  });

  it("flags a duplicate singular type (Organization appearing twice)", () => {
    const orgSchema: ExtractedSchema = {
      format: "json-ld",
      schemaType: "Organization",
      rawJson: { "@type": "Organization", name: "Acme", url: "https://example.com" },
      isValid: true,
      errors: [],
      warnings: [],
    };
    expect(keys([orgSchema, orgSchema])).toContain("SCHEMA_DUPLICATE_TYPE");
  });

  it("does not flag a repeated non-singular type (Product)", () => {
    const productSchema: ExtractedSchema = {
      format: "json-ld",
      schemaType: "Product",
      rawJson: { "@type": "Product", name: "Widget" },
      isValid: true,
      errors: [],
      warnings: [],
    };
    expect(keys([productSchema, productSchema])).not.toContain("SCHEMA_DUPLICATE_TYPE");
  });

  it("flags a URL mismatch for a site-identity type", () => {
    const schemas: ExtractedSchema[] = [
      {
        format: "json-ld",
        schemaType: "Organization",
        rawJson: { "@type": "Organization", name: "Acme", url: "https://a-totally-different-site.com" },
        isValid: true,
        errors: [],
        warnings: [],
      },
    ];
    expect(keys(schemas)).toContain("SCHEMA_URL_MISMATCH");
  });

  it("does not flag URL consistency for types where an external url is normal (e.g. Person)", () => {
    const schemas: ExtractedSchema[] = [
      {
        format: "json-ld",
        schemaType: "Person",
        rawJson: { "@type": "Person", name: "Jane", url: "https://linkedin.com/in/jane" },
        isValid: true,
        errors: [],
        warnings: [],
      },
    ];
    expect(keys(schemas)).not.toContain("SCHEMA_URL_MISMATCH");
  });

  it("skips microdata/rdfa entries for JSON-only checks (no isValid/required-property flags)", () => {
    const schemas: ExtractedSchema[] = [
      { format: "microdata", schemaType: "Product", rawJson: null, isValid: true, errors: [], warnings: [] },
    ];
    expect(keys(schemas)).toEqual([]);
  });
});

describe("evaluateOrganizationConsistency", () => {
  it("flags every page when Organization names differ across the crawl", () => {
    const entries: OrganizationNameEntry[] = [
      { pageId: "a", organizationName: "Acme Inc" },
      { pageId: "b", organizationName: "ACME Corporation" },
    ];
    const issues = evaluateOrganizationConsistency(entries);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.ruleKey === "SCHEMA_ORGANIZATION_NAME_INCONSISTENT")).toBe(true);
  });

  it("does not flag when all pages agree on the same name", () => {
    const entries: OrganizationNameEntry[] = [
      { pageId: "a", organizationName: "Acme Inc" },
      { pageId: "b", organizationName: "Acme Inc" },
    ];
    expect(evaluateOrganizationConsistency(entries)).toEqual([]);
  });

  it("does not flag a single page with no comparison point", () => {
    expect(evaluateOrganizationConsistency([{ pageId: "a", organizationName: "Acme" }])).toEqual([]);
  });
});
