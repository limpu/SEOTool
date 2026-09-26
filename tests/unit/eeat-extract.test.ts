import { describe, it, expect } from "vitest";
import { extractEeatSignals } from "@/lib/crawler/extract";

describe("extractEeatSignals — author byline", () => {
  it("detects a 'By [Name]' byline in the opening body text", () => {
    const html = `<html><body><h1>Title</h1><p>By Jane Smith</p><p>Article body text here.</p></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(true);
  });

  it("detects 'Written by [Name]'", () => {
    const html = `<html><body><h1>Title</h1><p>Written by John Doe</p></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(true);
  });

  it("detects an element with an 'author' class", () => {
    const html = `<html><body><div class="post-author">Jane Smith</div></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(true);
  });

  it("detects an itemprop='author' element", () => {
    const html = `<html><body><span itemprop="author">Jane Smith</span></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(true);
  });

  it("does not false-positive on the word 'by' alone (e.g. 'powered by')", () => {
    const html = `<html><body><p>This site is powered by open source software.</p></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(false);
  });

  it("does not false-positive on an unrelated class containing 'author' as a substring (e.g. 'authorization')", () => {
    const html = `<html><body><div class="authorization-panel">Sign in required</div></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(false);
  });

  it("returns false when there is no byline anywhere", () => {
    const html = `<html><body><p>Just some regular paragraph text with nothing special.</p></body></html>`;
    expect(extractEeatSignals(html).hasAuthorByline).toBe(false);
  });
});

describe("extractEeatSignals — rel=author", () => {
  it("detects an <a rel=\"author\"> link", () => {
    const html = `<html><body><a href="/authors/jane" rel="author">Jane Smith</a></body></html>`;
    expect(extractEeatSignals(html).hasRelAuthorLink).toBe(true);
  });

  it("returns false with no rel=author link", () => {
    const html = `<html><body><a href="/authors/jane">Jane Smith</a></body></html>`;
    expect(extractEeatSignals(html).hasRelAuthorLink).toBe(false);
  });
});

describe("extractEeatSignals — visible date", () => {
  it("detects a <time> element", () => {
    const html = `<html><body><time datetime="2026-08-22">August 22, 2026</time></body></html>`;
    expect(extractEeatSignals(html).hasVisibleDate).toBe(true);
  });

  it("detects an article:published_time meta tag", () => {
    const html = `<html><head><meta property="article:published_time" content="2026-08-22"></head><body></body></html>`;
    expect(extractEeatSignals(html).hasVisibleDate).toBe(true);
  });

  it("returns false with no date markup", () => {
    const html = `<html><body><p>No date here.</p></body></html>`;
    expect(extractEeatSignals(html).hasVisibleDate).toBe(false);
  });
});
