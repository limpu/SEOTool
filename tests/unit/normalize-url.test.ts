import { describe, it, expect } from "vitest";
import { normalizeCrawlUrl, isSameHost } from "@/lib/crawler/normalize-url";

describe("normalizeCrawlUrl", () => {
  it("lowercases host, strips default ports and fragments", () => {
    expect(normalizeCrawlUrl("HTTPS://Example.COM:443/Path#section")).toBe(
      "https://example.com/Path"
    );
    expect(normalizeCrawlUrl("http://example.com:80/foo")).toBe("http://example.com/foo");
  });

  it("collapses a trailing slash on non-root paths", () => {
    expect(normalizeCrawlUrl("https://example.com/foo/")).toBe("https://example.com/foo");
    expect(normalizeCrawlUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("resolves relative URLs against a base", () => {
    expect(normalizeCrawlUrl("/about", "https://example.com/blog/post")).toBe(
      "https://example.com/about"
    );
  });

  it("rejects non-http(s) protocols", () => {
    expect(normalizeCrawlUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCrawlUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeCrawlUrl("mailto:a@b.com")).toBeNull();
  });

  it("returns null for unparsable input", () => {
    expect(normalizeCrawlUrl("not a url")).toBeNull();
  });
});

describe("isSameHost", () => {
  it("matches identical hostnames case-insensitively", () => {
    expect(isSameHost("https://Example.com/page", "example.com")).toBe(true);
  });

  it("rejects different hosts, including subdomains", () => {
    expect(isSameHost("https://sub.example.com/page", "example.com")).toBe(false);
    expect(isSameHost("https://evil.com/page", "example.com")).toBe(false);
  });
});
