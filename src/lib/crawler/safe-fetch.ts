import { lookup as dnsLookup } from "dns/promises";
import * as http from "http";
import * as https from "https";
import { isAllowedProtocol, isBlockedIp } from "./ssrf";

export class CrawlFetchError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "blocked_protocol"
      | "blocked_ip"
      | "dns_failure"
      | "timeout"
      | "too_large"
      | "too_many_redirects"
      | "network_error"
  ) {
    super(message);
    this.name = "CrawlFetchError";
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent?: string;
  /** HEAD is used for lightweight link-checking (status/redirects only, no body needed). */
  method?: "GET" | "HEAD";
}

export interface SafeFetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  finalUrl: string;
  contentType: string | null;
  /** Number of redirect hops followed before reaching this response. */
  redirectCount: number;
}

const DEFAULTS: Required<SafeFetchOptions> = {
  timeoutMs: 10_000,
  maxRedirects: 5,
  maxBytes: 5 * 1024 * 1024, // 5 MB
  userAgent: "AISEOIntelligencePlatform-Crawler/0.1 (+internal)",
  method: "GET",
};

/**
 * Resolves `hostname` and rejects if it (or any of its resolved addresses)
 * points at a private/internal/reserved IP. Returns the specific address to
 * connect to, so the caller can pin the actual TCP connection to the address
 * that was validated — closing the DNS-rebinding TOCTOU gap where a second,
 * independent lookup at connect time could resolve somewhere else.
 */
async function resolveAndValidateHost(hostname: string): Promise<{ address: string; family: number }> {
  let records: { address: string; family: number }[];
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new CrawlFetchError(`Could not resolve hostname: ${hostname}`, "dns_failure");
  }

  if (records.length === 0) {
    throw new CrawlFetchError(`No addresses resolved for hostname: ${hostname}`, "dns_failure");
  }

  // Block-all-if-any-blocked: prevents multi-record tricks where a public
  // record is presented alongside a private one.
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new CrawlFetchError(
        `Refusing to fetch ${hostname}: resolves to a blocked/internal address.`,
        "blocked_ip"
      );
    }
  }

  return records[0];
}

function performRequest(
  targetUrl: URL,
  pinnedAddress: { address: string; family: number },
  opts: Required<SafeFetchOptions>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; location?: string }> {
  return new Promise((resolve, reject) => {
    const transport = targetUrl.protocol === "https:" ? https : http;

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: opts.method,
        headers: {
          Host: targetUrl.host,
          "User-Agent": opts.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: opts.timeoutMs,
        // Pin DNS resolution to the address we already validated, so the
        // real TCP connection can never land on a different (possibly
        // private) address than the one SSRF-checked above. Node's
        // "Happy Eyeballs" connection logic requests `{ all: true }` and
        // expects an array-shaped callback in that case.
        lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
          if (options?.all) {
            callback(null, [{ address: pinnedAddress.address, family: pinnedAddress.family }]);
          } else {
            callback(null, pinnedAddress.address, pinnedAddress.family);
          }
        }) as unknown as http.RequestOptions["lookup"],
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        // Redirects: don't read the body, let the caller re-validate and follow.
        if (status >= 300 && status < 400 && location) {
          res.resume();
          resolve({ status, headers: res.headers, body: Buffer.alloc(0), location });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let aborted = false;

        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > opts.maxBytes) {
            aborted = true;
            res.destroy();
            reject(new CrawlFetchError("Response exceeded the maximum allowed size.", "too_large"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          if (aborted) return;
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks) });
        });

        res.on("error", (err) => {
          if (aborted) return;
          reject(new CrawlFetchError(`Response error: ${err.message}`, "network_error"));
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new CrawlFetchError("Request timed out.", "timeout"));
    });

    req.on("error", (err) => {
      if (err instanceof CrawlFetchError) {
        reject(err);
      } else {
        reject(new CrawlFetchError(`Request failed: ${err.message}`, "network_error"));
      }
    });

    req.end();
  });
}

/**
 * SSRF-safe GET fetch: validates protocol, resolves + validates the target
 * IP, pins the connection to that IP, applies a timeout and a response-size
 * cap, and manually follows redirects — fully re-validating (protocol, DNS,
 * IP) each hop — up to `maxRedirects`.
 */
export async function safeFetch(inputUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = { ...DEFAULTS, ...options };

  let currentUrl: URL;
  try {
    currentUrl = new URL(inputUrl);
  } catch {
    throw new CrawlFetchError(`Invalid URL: ${inputUrl}`, "network_error");
  }

  for (let redirectCount = 0; redirectCount <= opts.maxRedirects; redirectCount++) {
    if (!isAllowedProtocol(currentUrl.protocol)) {
      throw new CrawlFetchError(`Blocked protocol: ${currentUrl.protocol}`, "blocked_protocol");
    }

    const pinned = await resolveAndValidateHost(currentUrl.hostname);
    const result = await performRequest(currentUrl, pinned, opts);

    if (result.location) {
      if (redirectCount === opts.maxRedirects) {
        throw new CrawlFetchError("Too many redirects.", "too_many_redirects");
      }
      currentUrl = new URL(result.location, currentUrl);
      continue;
    }

    return {
      status: result.status,
      headers: result.headers,
      body: result.body.toString("utf-8"),
      finalUrl: currentUrl.toString(),
      contentType: (result.headers["content-type"] as string | undefined) ?? null,
      redirectCount,
    };
  }

  throw new CrawlFetchError("Too many redirects.", "too_many_redirects");
}
