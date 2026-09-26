/**
 * Phase 30 — Reports: shared HTML/CSV escaping utilities.
 *
 * Every string this module escapes can originate from untrusted crawled
 * content (page titles, meta descriptions, issue evidence text, AI-inferred
 * explanations) — none of it is under this platform's control. Both the
 * generated HTML report and the generated CSV exports embed these strings
 * directly, so both escape functions exist as small, dedicated, well-tested
 * primitives rather than ad-hoc string interpolation at each call site.
 */

/**
 * HTML-escapes a string for safe embedding inside HTML text content or a
 * double-quoted HTML attribute. Prevents a crawled page's title/description
 * (or an AI-inferred explanation string) from being interpreted as markup —
 * a stored-XSS vector if a report were ever opened by someone other than
 * the user who generated it, or forwarded to a client, per this phase's
 * explicit security requirement.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a single CSV field per RFC 4180: wrap in double quotes and double
 * any embedded double quotes, whenever the field contains a comma, quote,
 * newline, or leading/trailing whitespace. Also neutralizes "CSV injection"
 * (a field starting with `=`, `+`, `-`, `@`, tab, or CR — characters that
 * Excel/Sheets/LibreOffice can interpret as the start of a formula when the
 * file is opened) by prefixing such fields with a single quote, the standard
 * mitigation recommended by OWASP's CSV Injection guidance — this platform
 * exports real crawled page titles/descriptions/evidence, which are
 * untrusted external content and must never be allowed to execute a formula
 * in the exporting user's spreadsheet application.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  const needsQuoting = /[",\n\r]/.test(str) || /^\s|\s$/.test(str);
  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds one CSV document (with a header row) from an array of row objects and an explicit column list, so column order/labels are never left to object-key iteration order. */
export function buildCsv<T extends object>(
  columns: { key: keyof T; label: string }[],
  rows: T[]
): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(","));
  // CRLF line endings — the RFC 4180-conventional choice, and what Excel expects.
  return [header, ...lines].join("\r\n") + "\r\n";
}
