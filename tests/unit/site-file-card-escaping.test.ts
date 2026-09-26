import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";

import { SiteFileCard } from "@/components/report/site-file-card";
import type { SiteFileEntry } from "@/lib/site-files/queries";

/**
 * Phase 37 — XSS regression tests for the fetched-file viewer.
 *
 * `raw_content` is whatever bytes a third-party server chose to return. It is
 * rendered into a report page that a user (and, via Phase 30's exports, other
 * people) will open, so a hostile sitemap or robots.txt must never be able to
 * execute anything. These tests render the REAL component through React's own
 * server renderer and assert the markup is inert.
 *
 * JSX is written as `createElement` calls because the unit suite runs plain
 * `.test.ts` files with no JSX transform configured.
 */

const HOSTILE = [
  '<?xml version="1.0"?>',
  "<urlset>",
  "  <url><loc>https://example.com/</loc></url>",
  '  <script>alert("xss")</script>',
  '  <img src=x onerror="alert(1)">',
  "  <!-- \"'&<> -->",
  "</urlset>",
].join("\n");

function entryWith(overrides: Partial<SiteFileEntry> = {}): SiteFileEntry {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type: "sitemap_xml",
    url: "https://example.com/sitemap.xml",
    source: "discovered",
    found: true,
    httpStatus: 200,
    rawContent: HOSTILE,
    sizeBytes: Buffer.byteLength(HOSTILE, "utf-8"),
    truncated: false,
    fetchError: null,
    fetchedAt: new Date("2026-08-30T00:00:00Z"),
    urlCount: 1,
    isIndex: false,
    title: null,
    ...overrides,
  };
}

describe("SiteFileCard renders fetched third-party content inert", () => {
  it("escapes a <script> tag in the file body instead of emitting executable markup", () => {
    const html = renderToStaticMarkup(
      createElement(SiteFileCard, { websiteId: "22222222-2222-2222-2222-222222222222", entry: entryWith() })
    );

    // The characters are visible to the reader…
    expect(html).toContain("&lt;script&gt;");
    // …but no real script/img element was ever created.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    // `onerror=` survives only as escaped TEXT (onerror=&quot;…), never as a
    // real attribute on a real element.
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    // And the surrounding quotes/ampersands are escaped too.
    expect(html).toContain("&quot;");
  });

  it("escapes a hostile URL rather than breaking out of the link attribute", () => {
    const html = renderToStaticMarkup(
      createElement(SiteFileCard, {
        websiteId: "22222222-2222-2222-2222-222222222222",
        entry: entryWith({ url: 'https://example.com/"><script>alert(1)</script>', rawContent: null }),
      })
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // The external link keeps its tab-nabbing protections.
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("renders no file viewer at all for an HTML sitemap, and explains why in words", () => {
    const html = renderToStaticMarkup(
      createElement(SiteFileCard, {
        websiteId: "22222222-2222-2222-2222-222222222222",
        entry: entryWith({ type: "sitemap_html", rawContent: null, found: false, httpStatus: null, urlCount: null, isIndex: null }),
      })
    );

    expect(html).not.toContain("Show file");
    expect(html).toContain("deliberately not downloaded");
  });

  it("distinguishes a measured 404 from a target that could not be reached", () => {
    const notFound = renderToStaticMarkup(
      createElement(SiteFileCard, {
        websiteId: "22222222-2222-2222-2222-222222222222",
        entry: entryWith({ found: false, httpStatus: 404, rawContent: null }),
      })
    );
    expect(notFound).toContain("Not found");
    expect(notFound).toContain("404");

    const unreachable = renderToStaticMarkup(
      createElement(SiteFileCard, {
        websiteId: "22222222-2222-2222-2222-222222222222",
        entry: entryWith({
          found: false,
          httpStatus: null,
          rawContent: null,
          fetchError: "This address is not permitted: it resolves to a private, loopback or internal network address.",
        }),
      })
    );
    expect(unreachable).toContain("Could not be reached");
    expect(unreachable).toContain("not permitted");
    expect(unreachable).not.toContain("Not found");
  });
});

describe("the viewer never opts out of React's escaping", () => {
  it("contains no dangerouslySetInnerHTML or innerHTML assignment", () => {
    const root = path.resolve(__dirname, "../../src");
    for (const file of [
      "components/report/site-file-card.tsx",
      "components/report/site-files-panel.tsx",
      "components/report/site-file-actions.tsx",
    ]) {
      const source = readFileSync(path.join(root, file), "utf-8");
      // An actual USE of the escape hatch, not the prose warning against it.
      expect(source).not.toMatch(/dangerouslySetInnerHTML\s*=/);
      expect(source).not.toMatch(/\.innerHTML\s*=/);
    }
  });
});
