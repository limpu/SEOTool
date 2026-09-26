/**
 * Normalizes a URL into a canonical string used to de-duplicate the crawl
 * queue: lowercase scheme/host, default ports stripped, fragment removed,
 * trailing slash on a bare path collapsed. Not a general-purpose URL
 * canonicalizer — just enough to avoid re-queuing the same page twice.
 */
export function normalizeCrawlUrl(rawUrl: string, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(rawUrl, base) : new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function isSameHost(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === hostname.toLowerCase();
  } catch {
    return false;
  }
}
