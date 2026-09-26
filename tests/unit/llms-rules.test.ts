import { describe, it, expect } from "vitest";
import { evaluateLlmsIssues } from "@/lib/seo-rules/llms";
import type { LlmsFileResult } from "@/lib/crawler/llms-analysis";
import type { ParsedLlmsTxt } from "@/lib/crawler/llms-txt-parser";

function file(overrides: Partial<LlmsFileResult> = {}): LlmsFileResult {
  return {
    kind: "llms_txt",
    url: "https://example.com/llms.txt",
    found: false,
    httpStatus: 404,
    rawContent: null,
    sizeBytes: null,
    parsed: null,
    ...overrides,
  };
}

function parsed(overrides: Partial<ParsedLlmsTxt> = {}): ParsedLlmsTxt {
  return { title: "Example", summary: null, sections: [], looseLinks: [], ...overrides };
}

function keys(llmsTxt: LlmsFileResult, llmsFullTxt: LlmsFileResult, host = "example.com") {
  return evaluateLlmsIssues(llmsTxt, llmsFullTxt, host).map((v) => v.ruleKey);
}

describe("evaluateLlmsIssues — missing files", () => {
  it("flags LLMS_TXT_MISSING (info) when neither file exists", () => {
    const v = keys(file(), file({ url: "https://example.com/llms-full.txt" }));
    expect(v).toContain("LLMS_TXT_MISSING");
    expect(v).not.toContain("LLMS_FULL_TXT_HTTP_ERROR");
  });

  it("flags LLMS_TXT_HTTP_ERROR instead of MISSING when the status isn't 404", () => {
    const v = keys(file({ httpStatus: 500 }), file());
    expect(v).toContain("LLMS_TXT_HTTP_ERROR");
    expect(v).not.toContain("LLMS_TXT_MISSING");
  });

  it("flags LLMS_FULL_TXT_WITHOUT_LLMS_TXT when only llms-full.txt exists", () => {
    const v = keys(
      file(),
      file({ found: true, httpStatus: 200, sizeBytes: 100, parsed: parsed() })
    );
    expect(v).toContain("LLMS_FULL_TXT_WITHOUT_LLMS_TXT");
  });
});

describe("evaluateLlmsIssues — structural checks on a found file", () => {
  it("produces no violations for a clean, minimal valid file", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 200,
        parsed: parsed({
          sections: [
            {
              heading: "Docs",
              links: [{ title: "Start", url: "https://example.com/start", description: null, isValidUrl: true }],
            },
          ],
        }),
      }),
      file()
    );
    expect(v).toEqual([]);
  });

  it("flags a missing H1 title", () => {
    const v = keys(file({ found: true, httpStatus: 200, sizeBytes: 10, parsed: parsed({ title: null }) }), file());
    expect(v).toContain("LLMS_TXT_MISSING_H1_TITLE");
  });

  it("flags an empty section", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({ sections: [{ heading: "Empty", links: [] }] }),
      }),
      file()
    );
    expect(v).toContain("LLMS_TXT_EMPTY_SECTION");
  });

  it("flags an invalid link URL", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({
          sections: [{ heading: "Docs", links: [{ title: "Bad", url: "not-a-url", description: null, isValidUrl: false }] }],
        }),
      }),
      file()
    );
    expect(v).toContain("LLMS_TXT_INVALID_LINK_URL");
  });

  it("flags a duplicate link URL", () => {
    const link = { title: "A", url: "https://example.com/a", description: null, isValidUrl: true };
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({ sections: [{ heading: "Docs", links: [link, { ...link, title: "B" }] }] }),
      }),
      file()
    );
    expect(v).toContain("LLMS_TXT_DUPLICATE_LINK");
  });

  it("flags an off-domain link", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({
          sections: [
            { heading: "Docs", links: [{ title: "Ext", url: "https://other.com/page", description: null, isValidUrl: true }] },
          ],
        }),
      }),
      file()
    );
    expect(v).toContain("LLMS_TXT_OFF_DOMAIN_LINK");
  });

  it("flags an oversized file", () => {
    const v = keys(
      file({ found: true, httpStatus: 200, sizeBytes: 200 * 1024, parsed: parsed() }),
      file()
    );
    expect(v).toContain("LLMS_TXT_TOO_LARGE");
  });
});

describe("evaluateLlmsIssues — llms-full.txt duplication", () => {
  const link = { title: "A", url: "https://example.com/a", description: null, isValidUrl: true };

  it("flags excessive duplication when llms-full.txt adds nothing new", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({ sections: [{ heading: "Docs", links: [link] }] }),
      }),
      file({
        url: "https://example.com/llms-full.txt",
        kind: "llms_full_txt",
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({ sections: [{ heading: "Docs", links: [link] }] }),
      })
    );
    expect(v).toContain("LLMS_FULL_TXT_EXCESSIVE_DUPLICATION");
  });

  it("does not flag duplication when llms-full.txt has additional links", () => {
    const v = keys(
      file({
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({ sections: [{ heading: "Docs", links: [link] }] }),
      }),
      file({
        url: "https://example.com/llms-full.txt",
        kind: "llms_full_txt",
        found: true,
        httpStatus: 200,
        sizeBytes: 10,
        parsed: parsed({
          sections: [
            { heading: "Docs", links: [link, { title: "B", url: "https://example.com/b", description: null, isValidUrl: true }] },
          ],
        }),
      })
    );
    expect(v).not.toContain("LLMS_FULL_TXT_EXCESSIVE_DUPLICATION");
  });
});
