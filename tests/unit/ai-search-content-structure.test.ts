import { describe, it, expect } from "vitest";
import { extractContentStructure, isFaqHeading, isQuestionHeading } from "@/lib/crawler/extract";

describe("isQuestionHeading", () => {
  it("matches a heading ending in a question mark", () => {
    expect(isQuestionHeading("Is this worth it?")).toBe(true);
  });

  it.each(["What is GEO", "How does it work", "Why does this matter", "Can I use it for free"])(
    "matches an interrogative-leading heading: %s",
    (text) => {
      expect(isQuestionHeading(text)).toBe(true);
    }
  );

  it("does not match a declarative heading", () => {
    expect(isQuestionHeading("Implementation Details")).toBe(false);
  });

  it("does not match an empty heading", () => {
    expect(isQuestionHeading("   ")).toBe(false);
  });
});

describe("isFaqHeading", () => {
  it("matches 'Frequently Asked Questions'", () => {
    expect(isFaqHeading("Frequently Asked Questions")).toBe(true);
  });

  it("matches 'FAQ' and 'FAQs'", () => {
    expect(isFaqHeading("FAQ")).toBe(true);
    expect(isFaqHeading("Product FAQs")).toBe(true);
  });

  it("does not match an unrelated heading", () => {
    expect(isFaqHeading("Our Team")).toBe(false);
  });
});

describe("extractContentStructure", () => {
  it("counts lists, ordered/unordered separately, tables, and definition lists", () => {
    const html = `
      <html><body>
        <ul><li>a</li></ul>
        <ol><li>b</li></ol>
        <table><tr><td>c</td></tr></table>
        <dl><dt>Term</dt><dd>Def</dd></dl>
      </body></html>
    `;
    const result = extractContentStructure(html);
    expect(result.listCount).toBe(2);
    expect(result.unorderedListCount).toBe(1);
    expect(result.orderedListCount).toBe(1);
    expect(result.tableCount).toBe(1);
    expect(result.definitionListCount).toBe(1);
  });

  it("returns zero counts for a page with none of these elements", () => {
    const html = "<html><body><p>Just a paragraph.</p></body></html>";
    const result = extractContentStructure(html);
    expect(result.listCount).toBe(0);
    expect(result.tableCount).toBe(0);
    expect(result.definitionListCount).toBe(0);
    expect(result.questionHeadings).toEqual([]);
    expect(result.hasFaqHeading).toBe(false);
  });

  it("collects question-shaped headings and detects an FAQ heading", () => {
    const html = `
      <html><body>
        <h1>Welcome</h1>
        <h2>What is GEO?</h2>
        <h2>Frequently Asked Questions</h2>
        <h3>How does it work?</h3>
        <h2>Pricing</h2>
      </body></html>
    `;
    const result = extractContentStructure(html);
    expect(result.questionHeadings).toEqual(["What is GEO?", "How does it work?"]);
    expect(result.hasFaqHeading).toBe(true);
  });
});
