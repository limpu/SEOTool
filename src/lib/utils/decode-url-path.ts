/**
 * Decode a percent-encoded URL path (e.g. a GA4 landing-page value) for
 * display. GA4's API returns raw percent-encoded paths — Bengali/non-ASCII
 * paths otherwise render as `%E0%A6%87...` instead of the real characters.
 * Falls back to the raw string if the sequence is malformed rather than
 * throwing and breaking the row.
 */
export function decodeLandingPage(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
