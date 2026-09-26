import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 37 — SSRF regression tests for the MANUAL-ADD path.
 *
 * `fetchSiteFile` is the only way this feature reaches the network, and the
 * manual-add API route takes the URL straight from a user, so this is the
 * exact shape Phase 6/32's SSRF work exists to defend. These tests assert the
 * defence holds through the site-files wrapper: a hostname that resolves to a
 * loopback / cloud-metadata / private-range address must be REFUSED before any
 * TCP connection is attempted, must be reported honestly, and must not be
 * retried by some other path.
 *
 * DNS is mocked (the same technique `lighthouse-ssrf.test.ts` uses) so the
 * attack shape can be reproduced deterministically without a real resolver.
 */

const lookupMock = vi.fn();

vi.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

// If the guard ever failed open, these would be called — asserting they are
// NOT is what proves the refusal happens before any socket is opened.
const httpRequestMock = vi.fn();
const httpsRequestMock = vi.fn();

vi.mock("http", () => ({ request: (...args: unknown[]) => httpRequestMock(...args) }));
vi.mock("https", () => ({ request: (...args: unknown[]) => httpsRequestMock(...args) }));

import { fetchSiteFile, capForStorage, isFetchable, STORE_CAP_BYTES } from "@/lib/site-files/fetch";
import { addSiteFileSchema } from "@/lib/validation/site-file";

describe("manual site-file fetch — SSRF refusal", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
  });

  const blocked: [string, string][] = [
    ["loopback", "127.0.0.1"],
    ["cloud metadata", "169.254.169.254"],
    ["private range", "10.0.0.1"],
    ["private range (RFC1918 192.168)", "192.168.1.1"],
    ["IPv6 loopback", "::1"],
  ];

  for (const [label, address] of blocked) {
    it(`refuses a target that resolves to ${label} (${address}) and never opens a socket`, async () => {
      lookupMock.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);

      const outcome = await fetchSiteFile("http://attacker.test/sitemap.xml", "sitemap_xml");

      expect(outcome.found).toBe(false);
      expect(outcome.rawContent).toBeNull();
      expect(outcome.httpStatus).toBeNull();
      expect(outcome.fetchError).toMatch(/not permitted/i);
      expect(httpRequestMock).not.toHaveBeenCalled();
      expect(httpsRequestMock).not.toHaveBeenCalled();
    });
  }

  it("refuses when ANY resolved address is blocked, even alongside a public one (DNS-rebinding shape)", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);

    const outcome = await fetchSiteFile("https://mixed.test/robots.txt", "robots_txt");

    expect(outcome.found).toBe(false);
    expect(outcome.fetchError).toMatch(/not permitted/i);
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("reports an unresolvable host honestly rather than as a missing file", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));

    const outcome = await fetchSiteFile("https://does-not-exist.test/llms.txt", "llms_txt");

    expect(outcome.found).toBe(false);
    expect(outcome.fetchError).toMatch(/could not be resolved/i);
  });

  it("rejects a non-http(s) protocol before ever resolving DNS", async () => {
    const outcome = await fetchSiteFile("file:///etc/passwd", "robots_txt");

    expect(outcome.found).toBe(false);
    expect(outcome.fetchError).toMatch(/http:\/\/ and https:\/\//);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("never fetches an HTML sitemap at all — no DNS lookup, no socket", async () => {
    const outcome = await fetchSiteFile("https://example.com/sitemap", "sitemap_html");

    expect(outcome.found).toBe(false);
    expect(outcome.rawContent).toBeNull();
    expect(outcome.fetchError).toBeNull();
    expect(isFetchable("sitemap_html")).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });
});

describe("manual site-file input validation", () => {
  it("rejects non-http(s) schemes at the API boundary", () => {
    for (const url of ["file:///etc/passwd", "gopher://127.0.0.1/", "javascript:alert(1)", "not a url"]) {
      const parsed = addSiteFileSchema.safeParse({ type: "robots_txt", url });
      expect(parsed.success).toBe(false);
    }
  });

  it("rejects an unknown file type", () => {
    expect(addSiteFileSchema.safeParse({ type: "passwd", url: "https://example.com/x" }).success).toBe(false);
  });

  it("accepts a well-formed https URL and trims it", () => {
    const parsed = addSiteFileSchema.safeParse({ type: "sitemap_xml", url: "  https://example.com/sitemap.xml  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBe("https://example.com/sitemap.xml");
  });
});

describe("storage cap honesty", () => {
  it("stores a small file whole and does not flag it as truncated", () => {
    const result = capForStorage("<urlset></urlset>");
    expect(result.truncated).toBe(false);
    expect(result.content).toBe("<urlset></urlset>");
    expect(result.sizeBytes).toBe(17);
  });

  it("flags an over-cap file as truncated and records its REAL size, not the stored size", () => {
    const big = "a".repeat(STORE_CAP_BYTES + 5000);
    const result = capForStorage(big);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, "utf-8")).toBe(STORE_CAP_BYTES);
    expect(result.sizeBytes).toBe(STORE_CAP_BYTES + 5000);
  });
});
