import { describe, it, expect } from "vitest";
import { parseLlmsTxt } from "@/lib/crawler/llms-txt-parser";

describe("parseLlmsTxt — valid structure", () => {
  it("parses title, summary, sections, and links", () => {
    const content = `# Example Site

> A one-line summary of what this site is about.

## Docs

- [Getting Started](https://example.com/docs/start): The intro guide.
- [API Reference](https://example.com/docs/api)

## Optional

- [Blog](https://example.com/blog): Latest posts.
`;
    const result = parseLlmsTxt(content);
    expect(result.title).toBe("Example Site");
    expect(result.summary).toBe("A one-line summary of what this site is about.");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe("Docs");
    expect(result.sections[0].links).toHaveLength(2);
    expect(result.sections[0].links[0]).toMatchObject({
      title: "Getting Started",
      url: "https://example.com/docs/start",
      description: "The intro guide.",
      isValidUrl: true,
    });
    expect(result.sections[0].links[1].description).toBeNull();
    expect(result.sections[1].heading).toBe("Optional");
    expect(result.sections[1].links).toHaveLength(1);
  });

  it("supports '*' bullets as well as '-'", () => {
    const content = `# Site
## Docs
* [Page](https://example.com/page): desc
`;
    const result = parseLlmsTxt(content);
    expect(result.sections[0].links).toHaveLength(1);
    expect(result.sections[0].links[0].url).toBe("https://example.com/page");
  });
});

describe("parseLlmsTxt — malformed / missing structure", () => {
  it("returns null title when there's no H1", () => {
    const content = `## Docs\n- [Page](https://example.com/page)`;
    const result = parseLlmsTxt(content);
    expect(result.title).toBeNull();
    expect(result.sections).toHaveLength(1);
  });

  it("returns an empty section when a heading has no links", () => {
    const content = `# Site\n## Empty Section\n## Docs\n- [Page](https://example.com/page)`;
    const result = parseLlmsTxt(content);
    expect(result.sections[0]).toMatchObject({ heading: "Empty Section", links: [] });
  });

  it("flags an invalid link URL", () => {
    const content = `# Site\n## Docs\n- [Broken](not-a-url)`;
    const result = parseLlmsTxt(content);
    expect(result.sections[0].links[0].isValidUrl).toBe(false);
  });

  it("puts links before any H2 into looseLinks", () => {
    const content = `# Site\n- [Loose](https://example.com/x)\n## Docs\n- [Page](https://example.com/page)`;
    const result = parseLlmsTxt(content);
    expect(result.looseLinks).toHaveLength(1);
    expect(result.sections[0].links).toHaveLength(1);
  });

  it("handles empty input without throwing", () => {
    const result = parseLlmsTxt("");
    expect(result.title).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.sections).toEqual([]);
  });

  it("ignores a non-link bullet line", () => {
    const content = `# Site\n## Notes\n- just a plain bullet, not a link\n`;
    const result = parseLlmsTxt(content);
    expect(result.sections[0].links).toEqual([]);
  });
});
