import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import type { CheckResult } from "../types";

const execFileAsync = promisify(execFile);

/**
 * Web Installer — can this runtime actually EXECUTE Chromium?
 *
 * ─── WHY EXECUTION, NOT PRESENCE ────────────────────────────────────────
 * PageSpeed (Phase 20/21) is not an API call. `src/lib/pagespeed/
 * lighthouse-runner.ts` launches a real Chrome/Chromium process via
 * `chrome-launcher` and drives Lighthouse against it. A check that only
 * asked "does a binary exist at this path?" would pass on the very common
 * failures that actually break this feature:
 *
 *   - the binary exists but its shared libraries do not (a slim base image
 *     without libnss3/libatk/libgbm — Chromium exits immediately);
 *   - the binary exists but is not executable by the app's user (the
 *     Dockerfile runs as the non-root `nextjs` user);
 *   - the binary exists but the sandbox cannot start under the container's
 *     seccomp profile.
 *
 * In all three the file is right there and Lighthouse still cannot run. So
 * this check EXECUTES `--version` and reports what actually happened. Under
 * no circumstances does it report PageSpeed as working on the strength of a
 * file existing — that would be reporting a capability the platform does not
 * have (Section 77 / Section 79 #3).
 *
 * ─── FAILING IS A `warn`, NOT A `fail` ──────────────────────────────────
 * PageSpeed is one module of many. The rest of the platform — crawling, the
 * rule engines, GSC/GA4, reporting — works perfectly without Chromium. A
 * hard block here would be an overstatement of the dependency. The honest
 * outcome is: install completes, and PageSpeed reports itself unavailable
 * rather than silently returning nothing.
 */

export interface ChromiumFacts {
  /** Path that resolution selected, if any. */
  resolvedPath: string | null;
  /** How that path was chosen — reported so the operator can correct it. */
  source: "PAGESPEED_CHROME_PATH" | "well-known-path" | "auto-detect" | "none";
  /** Version banner printed by the binary, if it ran. */
  versionOutput: string | null;
  /** Sanitized failure reason when execution failed. */
  executionError: string | null;
  /** True when PAGESPEED_CHROME_PATH is set but points at nothing. */
  configuredPathMissing: boolean;
}

export function evaluateChromium(facts: ChromiumFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "runtime.chromium",
    group: "runtime",
    label: "Chromium / Lighthouse (PageSpeed)",
    blocking: false,
  };

  const commonFixes = [
    "In Docker: use the provided Dockerfile — it installs `chromium` and sets PAGESPEED_CHROME_PATH=/usr/bin/chromium.",
    "On a Debian/Ubuntu VPS: `apt-get install -y chromium` (or `chromium-browser`), then set PAGESPEED_CHROME_PATH to its full path.",
    "Set PAGESPEED_CHROME_PATH explicitly to the browser binary if it is installed somewhere non-standard.",
    "A restart is required after changing PAGESPEED_CHROME_PATH — the value is read from process.env at call time, and process.env is not reloaded while the server runs.",
  ];

  if (facts.configuredPathMissing) {
    return {
      ...base,
      status: "warn",
      summary: "PAGESPEED_CHROME_PATH is set, but no file exists at that path.",
      detail:
        "PageSpeed audits will fail for every user until this is corrected. Every other module is unaffected.",
      howToFix: [
        "Correct PAGESPEED_CHROME_PATH, or unset it to let automatic detection search the standard locations.",
        ...commonFixes,
      ],
    };
  }

  if (!facts.resolvedPath) {
    return {
      ...base,
      status: "warn",
      summary: "No Chrome or Chromium binary could be found — PageSpeed audits will not run.",
      detail:
        "Lighthouse launches a real browser process; it does not call a hosted API. Without a browser binary the PageSpeed module reports itself unavailable. Nothing else in the platform is affected, so this does not block installation.",
      howToFix: commonFixes,
    };
  }

  if (facts.executionError) {
    return {
      ...base,
      status: "warn",
      summary: "A browser binary was found, but this process could not execute it.",
      detail:
        `The binary exists but running it failed: ${facts.executionError}. ` +
        "This is the classic slim-container case — Chromium is present while its shared libraries (libnss3, libatk1.0, libgbm, libasound2) are not, or the application's user cannot execute it. PageSpeed would fail at run time, so it is reported as unavailable here rather than assumed to work.",
      howToFix: [
        "Install Chromium's runtime dependencies: `apt-get install -y chromium` pulls them in; a manually-copied binary does not.",
        "Confirm the application's user can execute the binary (the provided Dockerfile runs as the non-root `nextjs` user).",
        "Try running the binary manually as that user: `<path> --headless --no-sandbox --version`.",
        ...commonFixes,
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: facts.versionOutput
      ? `Chromium executed successfully — ${facts.versionOutput}.`
      : "Chromium executed successfully, though it did not print a recognisable version banner.",
    detail: `Resolved via ${facts.source}. PageSpeed/Lighthouse audits can run on this host.`,
  };
}

/**
 * Resolve a browser binary using the SAME order as
 * `src/lib/pagespeed/lighthouse-runner.ts` (`PAGESPEED_CHROME_PATH`, then the
 * standard Windows install paths, then chrome-launcher's own detection).
 * Reimplemented here rather than imported because importing that module
 * pulls the SSRF/DNS machinery and the Lighthouse dependency graph into the
 * installer for no benefit — and because this must never be able to change
 * PageSpeed's behaviour as a side effect of the installer running.
 */
function resolveBrowserPath(env: NodeJS.ProcessEnv = process.env): {
  path: string | null;
  source: ChromiumFacts["source"];
  configuredPathMissing: boolean;
} {
  const configured = env.PAGESPEED_CHROME_PATH;
  if (configured) {
    const exists = safeExists(configured);
    return {
      path: exists ? configured : null,
      source: "PAGESPEED_CHROME_PATH",
      configuredPathMissing: !exists,
    };
  }

  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : [
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/snap/bin/chromium",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ];

  for (const c of candidates) {
    if (safeExists(c)) return { path: c, source: "well-known-path", configuredPathMissing: false };
  }
  return { path: null, source: "none", configuredPathMissing: false };
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function checkChromium(env: NodeJS.ProcessEnv = process.env): Promise<CheckResult> {
  const resolved = resolveBrowserPath(env);
  if (!resolved.path) {
    return evaluateChromium({
      resolvedPath: null,
      source: resolved.source,
      versionOutput: null,
      executionError: null,
      configuredPathMissing: resolved.configuredPathMissing,
    });
  }

  try {
    const { stdout, stderr } = await execFileAsync(resolved.path, ["--version"], {
      timeout: 10000,
      windowsHide: true,
    });
    // Pick the line that actually looks like a version banner. On Windows,
    // `chrome.exe --version` prints "Opening in existing browser session."
    // first when a Chrome instance is already running — reporting that as
    // the version would be a meaningless (and misleading) success message.
    const lines = `${stdout}\n${stderr}`
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const version =
      lines.find((l) => /(chrom(e|ium)|headless)/i.test(l) && /\d+\.\d+/.test(l)) ??
      lines.find((l) => /\d+\.\d+\.\d+/.test(l)) ??
      null;
    return evaluateChromium({
      resolvedPath: resolved.path,
      source: resolved.source,
      versionOutput: version,
      executionError: null,
      configuredPathMissing: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only the driver-independent part of the message is kept, and the
    // absolute binary path is deliberately not echoed back.
    const short = message.split("\n")[0].slice(0, 160);
    return evaluateChromium({
      resolvedPath: resolved.path,
      source: resolved.source,
      versionOutput: null,
      executionError: short,
      configuredPathMissing: false,
    });
  }
}
