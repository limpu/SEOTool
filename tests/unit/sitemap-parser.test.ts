import { describe, it, expect } from "vitest";
import { parseSitemapXml } from "@/lib/crawler/sitemap-parser";

describe("parseSitemapXml — urlset", () => {
  it("parses a standard urlset with multiple entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.valid).toBe(true);
    expect(result.kind).toBe("urlset");
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0]).toMatchObject({
      loc: "https://example.com/",
      lastmod: "2026-01-01",
      changefreq: "daily",
      priority: "1",
    });
    expect(result.urls[1]).toMatchObject({ loc: "https://example.com/about", lastmod: null });
  });

  it("handles a urlset with exactly one url entry (not auto-wrapped in an array by the XML parser)", () => {
    const xml = `<urlset><url><loc>https://example.com/only</loc></url></urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].loc).toBe("https://example.com/only");
  });
});

describe("parseSitemapXml — sitemapindex", () => {
  it("parses a sitemap index with multiple sitemap references", () => {
    const xml = `<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-1.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;
    const result = parseSitemapXml(xml);
    expect(result.valid).toBe(true);
    expect(result.kind).toBe("sitemapindex");
    expect(result.sitemapRefs).toHaveLength(2);
    expect(result.sitemapRefs[0]).toMatchObject({ loc: "https://example.com/sitemap-1.xml", lastmod: "2026-01-01" });
  });
});

describe("parseSitemapXml — invalid input", () => {
  it("rejects malformed XML (unclosed tag)", () => {
    const result = parseSitemapXml(`<urlset><url><loc>https://example.com/</loc></urlset>`);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.urls).toEqual([]);
  });

  it("rejects completely non-XML content", () => {
    const result = parseSitemapXml(`<html><body>Not a sitemap</body></html>`);
    // Well-formed XML but neither urlset nor sitemapindex.
    expect(result.kind).toBe("unknown");
  });

  it("rejects empty input", () => {
    const result = parseSitemapXml("");
    expect(result.valid).toBe(false);
  });
});
