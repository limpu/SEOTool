import { describe, expect, it } from "vitest";
import { buildPageAssessmentPrompt, buildContentGapPrompt, PAGE_ASSESSMENT_PROMPT_VERSION, CONTENT_GAP_PROMPT_VERSION } from "@/lib/ai/prompts";

describe("buildPageAssessmentPrompt", () => {
  it("includes the URL, title, headings, and body text", () => {
    const { system, prompt } = buildPageAssessmentPrompt({
      url: "https://example.com/page",
      title: "Example Title",
      headings: [{ level: 1, text: "Main Heading" }, { level: 2, text: "Sub Heading" }],
      bodyText: "Some body content here.",
    });
    expect(system).toContain("JSON object");
    expect(prompt).toContain("https://example.com/page");
    expect(prompt).toContain("Example Title");
    expect(prompt).toContain("H1: Main Heading");
    expect(prompt).toContain("H2: Sub Heading");
    expect(prompt).toContain("Some body content here.");
  });

  it("handles a page with no headings and no title without throwing", () => {
    const { prompt } = buildPageAssessmentPrompt({ url: "https://example.com/", title: null, headings: [], bodyText: "text" });
    expect(prompt).toContain("(no headings found)");
    expect(prompt).toContain("(none)");
  });

  it("truncates very long body text to 8000 characters", () => {
    const longBody = "a".repeat(20000);
    const { prompt } = buildPageAssessmentPrompt({ url: "https://example.com/", title: null, headings: [], bodyText: longBody });
    const bodySection = prompt.split("Body text (may be truncated):\n")[1];
    expect(bodySection.length).toBe(8000);
  });

  it("has a stable prompt version identifier", () => {
    expect(PAGE_ASSESSMENT_PROMPT_VERSION).toBe("v1");
  });
});

describe("buildContentGapPrompt", () => {
  it("includes both URLs and both bodies, clearly separated", () => {
    const { prompt } = buildContentGapPrompt({
      yourUrl: "https://mine.com/a",
      yourBodyText: "My content about widgets.",
      competitorUrl: "https://theirs.com/b",
      competitorBodyText: "Their content about widgets and gadgets.",
    });
    expect(prompt).toContain("YOUR PAGE (https://mine.com/a)");
    expect(prompt).toContain("My content about widgets.");
    expect(prompt).toContain("COMPETITOR PAGE (https://theirs.com/b)");
    expect(prompt).toContain("Their content about widgets and gadgets.");
  });

  it("truncates each side independently to 6000 characters", () => {
    const long = "b".repeat(20000);
    const { prompt } = buildContentGapPrompt({ yourUrl: "u1", yourBodyText: long, competitorUrl: "u2", competitorBodyText: long });
    // Both truncated segments should appear, each capped — verify total length reflects two 6000-char blocks, not two 20000-char blocks.
    expect(prompt.length).toBeLessThan(13000);
  });

  it("has a stable prompt version identifier", () => {
    expect(CONTENT_GAP_PROMPT_VERSION).toBe("v1");
  });
});
