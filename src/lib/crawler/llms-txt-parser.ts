/**
 * Parser for the llms.txt community convention (Phase 18). This is not an
 * IETF/W3C standard — it's an emerging, informal markdown convention. The
 * shape this parser expects (per the community spec at llmstxt.org, and the
 * master doc's Phase 18/Section 40-41 audit list):
 *
 *   # Title
 *   > Optional one-line blockquote summary
 *   Optional free-form paragraphs
 *   ## Section Name
 *   - [Link Title](https://example.com/page): optional description
 *   - [Another Link](https://example.com/other)
 *   ## Optional
 *   - [Something Optional](https://example.com/x): often used for secondary links
 *
 * Parsing is intentionally lenient (real-world files won't perfectly match
 * the spec) but structural — it extracts what's actually there rather than
 * guessing at intent.
 */

export interface LlmsTxtLink {
  title: string;
  url: string;
  description: string | null;
  /** Whether `url` parses as a valid absolute http/https URL. */
  isValidUrl: boolean;
}

export interface LlmsTxtSection {
  heading: string;
  links: LlmsTxtLink[];
}

export interface ParsedLlmsTxt {
  /** The H1 title line, or null if none was found. */
  title: string | null;
  /** The blockquote (`>`) summary directly under the title, or null. */
  summary: string | null;
  sections: LlmsTxtSection[];
  /** Links that appear before any H2 section heading (rare, but possible). */
  looseLinks: LlmsTxtLink[];
}

const LINK_LINE_RE = /^-\s*\[([^\]]*)\]\(([^)]*)\)\s*(?::\s*(.*))?$/;

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseLinkLine(line: string): LlmsTxtLink | null {
  const match = LINK_LINE_RE.exec(line.trim());
  if (!match) return null;
  const [, title, url, description] = match;
  return {
    title: title.trim(),
    url: url.trim(),
    description: description?.trim() || null,
    isValidUrl: isValidAbsoluteUrl(url.trim()),
  };
}

/**
 * Parses raw llms.txt (or llms-full.txt) markdown content into its
 * structural components. Never throws — malformed input just yields fewer
 * recognized parts (e.g. `title: null`), left for the rule evaluator to flag.
 */
export function parseLlmsTxt(content: string): ParsedLlmsTxt {
  const lines = content.split(/\r?\n/);

  let title: string | null = null;
  let summary: string | null = null;
  const sections: LlmsTxtSection[] = [];
  const looseLinks: LlmsTxtLink[] = [];
  let currentSection: LlmsTxtSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("# ") || line === "#") {
      // Only the first H1 counts as the title (per spec, there should be exactly one).
      if (title === null) {
        title = line.replace(/^#\s*/, "").trim() || null;
      }
      continue;
    }

    if (line.startsWith("## ") || line === "##") {
      const heading = line.replace(/^##\s*/, "").trim();
      currentSection = { heading, links: [] };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith(">") && summary === null && currentSection === null) {
      summary = line.replace(/^>\s*/, "").trim() || null;
      continue;
    }

    if (line.startsWith("-") || line.startsWith("*")) {
      const link = parseLinkLine(line.startsWith("*") ? "-" + line.slice(1) : line);
      if (link) {
        if (currentSection) {
          currentSection.links.push(link);
        } else {
          looseLinks.push(link);
        }
      }
      continue;
    }

    // Other free-form text (paragraphs, notes) is intentionally not modeled —
    // the spec's audit list only cares about title/summary/sections/links.
  }

  return { title, summary, sections, looseLinks };
}
