import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface SitemapUrlEntry {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
}

export interface SitemapIndexEntry {
  loc: string;
  lastmod: string | null;
}

export interface ParsedSitemap {
  valid: boolean;
  errors: string[];
  kind: "urlset" | "sitemapindex" | "unknown";
  urls: SitemapUrlEntry[];
  sitemapRefs: SitemapIndexEntry[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * Parses and validates a sitemap or sitemap-index XML document using a real
 * XML parser (not regex) — `fast-xml-parser`'s validator rejects genuinely
 * malformed XML, which regex extraction can't reliably distinguish from
 * valid-but-differently-formatted markup.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (validation !== true) {
    return {
      valid: false,
      errors: [validation.err?.msg ?? "Invalid XML"],
      kind: "unknown",
      urls: [],
      sitemapRefs: [],
    };
  }

  let parsed: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    parsed = parser.parse(xml);
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : "XML parse error"],
      kind: "unknown",
      urls: [],
      sitemapRefs: [],
    };
  }

  const root = parsed as Record<string, unknown>;

  if (root.urlset && typeof root.urlset === "object") {
    const urlset = root.urlset as Record<string, unknown>;
    const rawUrls = toArray(urlset.url as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const urls: SitemapUrlEntry[] = rawUrls
      .map((u) => ({
        loc: stringOrNull(u?.loc),
        lastmod: stringOrNull(u?.lastmod),
        changefreq: stringOrNull(u?.changefreq),
        priority: stringOrNull(u?.priority),
      }))
      .filter((u): u is SitemapUrlEntry => u.loc !== null);
    return { valid: true, errors: [], kind: "urlset", urls, sitemapRefs: [] };
  }

  if (root.sitemapindex && typeof root.sitemapindex === "object") {
    const index = root.sitemapindex as Record<string, unknown>;
    const rawRefs = toArray(index.sitemap as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const sitemapRefs: SitemapIndexEntry[] = rawRefs
      .map((s) => ({ loc: stringOrNull(s?.loc), lastmod: stringOrNull(s?.lastmod) }))
      .filter((s): s is SitemapIndexEntry => s.loc !== null);
    return { valid: true, errors: [], kind: "sitemapindex", urls: [], sitemapRefs };
  }

  return { valid: true, errors: [], kind: "unknown", urls: [], sitemapRefs: [] };
}
