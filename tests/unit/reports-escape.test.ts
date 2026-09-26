import { describe, it, expect } from "vitest";
import { escapeHtml, escapeCsvField, buildCsv } from "@/lib/reports/escape";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;"
    );
  });

  it("neutralizes a page title crafted to break out of an HTML attribute/tag", () => {
    const maliciousTitle = `"><img src=x onerror=alert(1)>`;
    const escaped = escapeHtml(maliciousTitle);
    expect(escaped).not.toContain("<img");
    expect(escaped).not.toContain('">');
    expect(escaped).toBe("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("returns an empty string for null/undefined rather than the literal word", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("stringifies numbers/booleans safely", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(false)).toBe("false");
  });

  it("leaves plain, safe text unchanged", () => {
    expect(escapeHtml("Best Hiking Boots 2026")).toBe("Best Hiking Boots 2026");
  });
});

describe("escapeCsvField", () => {
  it("wraps a field containing a comma in quotes", () => {
    expect(escapeCsvField("Missing meta description, canonical tag")).toBe(
      '"Missing meta description, canonical tag"'
    );
  });

  it("doubles embedded double quotes and wraps in quotes", () => {
    expect(escapeCsvField(`He said "hello"`)).toBe(`"He said ""hello"""`);
  });

  it("wraps a field containing a newline", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralizes CSV-injection formula-leading characters with a leading single quote", () => {
    expect(escapeCsvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(escapeCsvField("+1234")).toBe("'+1234");
    expect(escapeCsvField("-1234")).toBe("'-1234");
    expect(escapeCsvField("@SUM(1,2)")).toBe("\"'@SUM(1,2)\"");
  });

  it("leaves an ordinary field unquoted", () => {
    expect(escapeCsvField("ONPAGE_TITLE_MISSING")).toBe("ONPAGE_TITLE_MISSING");
  });

  it("returns an empty string for null/undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("quotes a field with leading/trailing whitespace", () => {
    expect(escapeCsvField("  padded  ")).toBe('"  padded  "');
  });
});

describe("buildCsv", () => {
  it("builds a header row plus one row per input, using explicit column labels", () => {
    const csv = buildCsv(
      [
        { key: "a", label: "Column A" },
        { key: "b", label: "Column B" },
      ],
      [
        { a: "1", b: "2" },
        { a: "x,y", b: '"z"' },
      ]
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Column A,Column B");
    expect(lines[1]).toBe("1,2");
    expect(lines[2]).toBe('"x,y","""z"""');
    expect(lines[lines.length - 1]).toBe(""); // trailing CRLF
  });

  it("produces just a header row for zero data rows", () => {
    const csv = buildCsv([{ key: "a", label: "A" }], []);
    expect(csv).toBe("A\r\n");
  });
});
