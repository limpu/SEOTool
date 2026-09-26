import { lookup as dnsLookup } from "dns/promises";
import { isBlockedIp } from "@/lib/crawler/ssrf";
import { extractPageSpeedMetrics, trimLighthouseResult, type LighthouseResultLike } from "./extract-metrics";

/**
 * Runs Google Lighthouse locally against a headless Chrome instance this
 * process launches itself — chosen deliberately over the hosted PageSpeed
 * Insights API (see decision log / read.md Phase 20 write-up): the hosted
 * API is a third-party service with quota limits and an API-key
 * requirement, which conflicts with this project's "zero mandatory paid/
 * hosted external API" posture (Section 79 #1) even though its free tier
 * has no dollar cost. Running Lighthouse locally via `lighthouse` +
 * `chrome-launcher` against the system's installed Chrome keeps PageSpeed
 * in the same "everything runs in our own process" category as every prior
 * phase's `safeFetch`-based analysis, and matches the master doc's own
 * Technology Baseline ("Playwright only when rendering is necessary" /
 * "Performance: Google Lighthouse, Chromium").
 *
 * This module is server-only — `lighthouse`/`chrome-launcher` must never be
 * bundled into a client chunk (see next.config.ts serverExternalPackages).
 */

export type PageSpeedStrategy = "mobile" | "desktop";

export class LighthouseRunError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LighthouseRunError";
  }
}

/**
 * Best-effort SSRF guard for the URL Lighthouse will navigate to. This is
 * NOT the same guarantee as `safeFetch`'s DNS-pinned, per-redirect-hop
 * validation (Phase 6) — Chrome, not our own socket code, does the actual
 * navigation. It is still worth doing: it rejects the obvious cases (a
 * website URL that already resolves to a private/loopback/metadata
 * address) before ever launching a browser against it.
 *
 * Phase 32 hardening: this check alone left a classic DNS-rebinding TOCTOU
 * gap — this function resolves+validates the hostname, but Chrome performs
 * its own independent DNS resolution at navigation time (milliseconds
 * later), so a malicious DNS server could return a public IP for this
 * check and then rebind the same name to 169.254.169.254 (or any other
 * blocked address) before Chrome connects. `runLighthouseAudit` now pins
 * the *exact validated IP* into Chrome via `--host-resolver-rules`
 * (`buildHostResolverRule`, below) so Chrome connects to the address this
 * function actually checked, not to whatever the name resolves to a
 * moment later — mirroring `safeFetch`'s own DNS-pinning approach (Phase
 * 6) as closely as Chrome's process-level API allows.
 *
 * Residual, documented gap: this pin only covers the *initial* navigation
 * hostname. If the target page issues an HTTP redirect to a *different*
 * hostname, Chrome resolves that new hostname itself, unpinned — full
 * per-redirect-hop re-validation (as `safeFetch` does) is not achievable
 * through chrome-launcher's flag-based API without CDP request
 * interception, which was judged out of scope for this phase's fix (see
 * read.md Phase 32 write-up, "Documented for later").
 */
export async function assertPublicUrl(rawUrl: string): Promise<{ url: URL; pinnedIp: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new LighthouseRunError(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LighthouseRunError(`Unsupported protocol: ${url.protocol}`);
  }

  let records;
  try {
    records = await dnsLookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new LighthouseRunError(`Could not resolve hostname: ${url.hostname}`);
  }
  const safeRecord = records.find((r) => !isBlockedIp(r.address));
  if (!safeRecord) {
    throw new LighthouseRunError(`Refusing to audit a URL that resolves to a private/blocked address: ${url.hostname}`);
  }

  return { url, pinnedIp: safeRecord.address };
}

/**
 * Builds a Chrome `--host-resolver-rules` flag pinning `hostname` to
 * `ip` — the same DNS-rebinding mitigation `safeFetch`'s custom `lookup`
 * achieves for plain HTTP(S) requests, expressed the way Chrome's own
 * process-level flags require it. IPv6 literals must be bracketed per
 * Chrome's documented host-resolver-rules syntax.
 */
export function buildHostResolverRule(hostname: string, ip: string): string {
  const target = ip.includes(":") ? `[${ip}]` : ip;
  return `--host-resolver-rules=MAP ${hostname} ${target}`;
}

const MOBILE_FORM_FACTOR = {
  formFactor: "mobile" as const,
  screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  throttling: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 4,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
};

const DESKTOP_FORM_FACTOR = {
  formFactor: "desktop" as const,
  screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  throttling: {
    rttMs: 40,
    throughputKbps: 10240,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
};

export interface LighthouseRunResult {
  metrics: ReturnType<typeof extractPageSpeedMetrics>;
  trimmedResult: ReturnType<typeof trimLighthouseResult>;
}

/**
 * Locates a Chrome/Chromium executable. Prefers the system-installed Chrome
 * (this environment has Chrome 151.x at the standard Windows path — see
 * read.md's environment table) and falls back to `chrome-launcher`'s own
 * auto-detection (covers Linux/macOS CI, or a machine without Windows'
 * standard install path).
 */
function resolveChromePath(): string | undefined {
  if (process.env.PAGESPEED_CHROME_PATH) return process.env.PAGESPEED_CHROME_PATH;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    for (const c of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ c)) return c;
    }
  }
  return undefined; // let chrome-launcher search its own default locations
}

export async function runLighthouseAudit(
  targetUrl: string,
  strategy: PageSpeedStrategy
): Promise<LighthouseRunResult> {
  const { url, pinnedIp } = await assertPublicUrl(targetUrl);

  // Dynamic import: keeps `lighthouse`/`chrome-launcher` out of any module
  // graph Next.js might try to trace for a client bundle unless this
  // function is actually invoked (belt-and-suspenders alongside marking
  // the packages server-external in next.config.ts).
  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import("lighthouse"),
    import("chrome-launcher"),
  ]);

  const chromePath = resolveChromePath();
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      // Phase 32 SSRF hardening — pin the exact IP `assertPublicUrl`
      // already validated so Chrome can't be DNS-rebound to a blocked
      // address between our check and its own connection. See the
      // `assertPublicUrl` doc comment above for the residual redirect gap.
      buildHostResolverRule(url.hostname, pinnedIp),
    ],
  });

  try {
    const formFactorConfig = strategy === "mobile" ? MOBILE_FORM_FACTOR : DESKTOP_FORM_FACTOR;
    const runnerResult = await lighthouse(
      url.toString(),
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
      {
        extends: "lighthouse:default",
        settings: {
          formFactor: formFactorConfig.formFactor,
          screenEmulation: formFactorConfig.screenEmulation,
          throttling: formFactorConfig.throttling,
        },
      }
    );

    if (!runnerResult) {
      throw new LighthouseRunError("Lighthouse returned no result.");
    }

    const lhr = runnerResult.lhr as unknown as LighthouseResultLike & Record<string, unknown>;
    return {
      metrics: extractPageSpeedMetrics(lhr),
      trimmedResult: trimLighthouseResult(lhr),
    };
  } catch (err) {
    if (err instanceof LighthouseRunError) throw err;
    throw new LighthouseRunError(`Lighthouse run failed: ${err instanceof Error ? err.message : String(err)}`, err);
  } finally {
    // chrome-launcher's tmp-dir cleanup can throw EPERM on Windows when the
    // OS still holds a brief lock on Chrome's profile directory right after
    // the process exits — this is a benign, already-known chrome-launcher/
    // Windows interaction, not a real failure of the audit itself, so it's
    // swallowed rather than surfaced as a run error.
    try {
      await chrome.kill();
    } catch {
      // ignore — see comment above
    }
  }
}
