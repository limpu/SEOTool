import { describe, it, expect } from "vitest";
import { evaluateImageIssues, evaluateImageFileSizeIssues } from "@/lib/seo-rules/images";
import type { ExtractedImage } from "@/lib/crawler/extract";

function img(overrides: Partial<ExtractedImage> = {}): ExtractedImage {
  return {
    url: "https://example.com/photo.webp",
    alt: "A photo",
    altAttributeExists: true,
    width: 800,
    height: 600,
    lazyLoaded: false,
    hasSrcset: true,
    ...overrides,
  };
}

function keys(images: ExtractedImage[]) {
  return evaluateImageIssues(images).map((v) => v.ruleKey);
}

describe("evaluateImageIssues — clean image", () => {
  it("produces no violations for a fully compliant image", () => {
    expect(keys([img()])).toEqual([]);
  });

  it("returns nothing for a page with no images", () => {
    expect(evaluateImageIssues([])).toEqual([]);
  });
});

describe("dimensions", () => {
  it("flags an image missing width", () => {
    expect(keys([img({ width: null })])).toContain("IMAGE_MISSING_DIMENSIONS");
  });

  it("flags an image missing height", () => {
    expect(keys([img({ height: null })])).toContain("IMAGE_MISSING_DIMENSIONS");
  });

  it("does not flag when both dimensions are present", () => {
    expect(keys([img({ width: 100, height: 100 })])).not.toContain("IMAGE_MISSING_DIMENSIONS");
  });
});

describe("format", () => {
  it("flags legacy formats (jpg/png/gif)", () => {
    expect(keys([img({ url: "https://example.com/a.jpg" })])).toContain("IMAGE_LEGACY_FORMAT");
    expect(keys([img({ url: "https://example.com/a.png" })])).toContain("IMAGE_LEGACY_FORMAT");
    expect(keys([img({ url: "https://example.com/a.gif" })])).toContain("IMAGE_LEGACY_FORMAT");
  });

  it("does not flag modern formats", () => {
    expect(keys([img({ url: "https://example.com/a.webp" })])).not.toContain("IMAGE_LEGACY_FORMAT");
    expect(keys([img({ url: "https://example.com/a.avif" })])).not.toContain("IMAGE_LEGACY_FORMAT");
  });

  it("does not flag an unknown/extensionless URL", () => {
    expect(keys([img({ url: "https://example.com/image?id=42" })])).not.toContain("IMAGE_LEGACY_FORMAT");
  });
});

describe("responsive images", () => {
  it("flags a wide image with no srcset", () => {
    expect(keys([img({ width: 1200, hasSrcset: false })])).toContain("IMAGE_MISSING_SRCSET");
  });

  it("does not flag a small image without srcset", () => {
    expect(keys([img({ width: 100, hasSrcset: false })])).not.toContain("IMAGE_MISSING_SRCSET");
  });

  it("does not flag a wide image that has srcset", () => {
    expect(keys([img({ width: 1200, hasSrcset: true })])).not.toContain("IMAGE_MISSING_SRCSET");
  });

  it("does not flag when width is unknown", () => {
    expect(keys([img({ width: null, hasSrcset: false })])).not.toContain("IMAGE_MISSING_SRCSET");
  });
});

describe("LCP lazy-loading", () => {
  it("flags the first image on the page when lazy-loaded", () => {
    expect(keys([img({ lazyLoaded: true }), img({ url: "https://example.com/b.webp" })])).toContain(
      "IMAGE_LCP_LAZY_LOADED"
    );
  });

  it("does not flag a lazy-loaded image that isn't first", () => {
    const violations = keys([
      img({ url: "https://example.com/first.webp", lazyLoaded: false }),
      img({ url: "https://example.com/second.webp", lazyLoaded: true }),
    ]);
    expect(violations).not.toContain("IMAGE_LCP_LAZY_LOADED");
  });
});

describe("evaluateImageFileSizeIssues", () => {
  it("flags an image over 1MB", () => {
    const sizeByUrl = new Map([["https://example.com/photo.webp", 2 * 1024 * 1024]]);
    const violations = evaluateImageFileSizeIssues([img()], sizeByUrl);
    expect(violations.map((v) => v.ruleKey)).toContain("IMAGE_LARGE_FILE_SIZE");
  });

  it("does not flag an image under 1MB", () => {
    const sizeByUrl = new Map([["https://example.com/photo.webp", 100 * 1024]]);
    expect(evaluateImageFileSizeIssues([img()], sizeByUrl)).toEqual([]);
  });

  it("does not flag an image with unknown (unchecked) size", () => {
    expect(evaluateImageFileSizeIssues([img()], new Map())).toEqual([]);
  });
});
