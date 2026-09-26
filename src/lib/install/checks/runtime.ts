import { execFile } from "child_process";
import { promisify } from "util";
import type { CheckResult } from "../types";

const execFileAsync = promisify(execFile);

/**
 * Web Installer — runtime checks (Node.js, package manager).
 *
 * Every function here splits into a PURE `evaluate*` that takes already-
 * collected facts and returns a `CheckResult`, and a thin async collector
 * that gathers those facts. All of the judgement — every threshold, every
 * status boundary, every remediation string — lives in the pure half, so it
 * is unit-testable without spawning a process or touching the filesystem.
 */

/**
 * Node 24 is the baseline because it is what this project is actually built
 * and shipped on: `package.json` pins `@types/node ^26`, the Dockerfile's
 * three stages are all `node:24-slim`, and the project uses `fs.statfs`
 * (Node ≥ 18.15) plus modern `crypto`/`fs.promises` behaviour throughout.
 * Older majors are a `fail`, not a `warn` — this is not a preference.
 */
export const NODE_BASELINE_MAJOR = 24;

export function parseNodeMajor(version: string): number | null {
  const m = /^v?(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : null;
}

export function evaluateNodeVersion(version: string): CheckResult {
  const major = parseNodeMajor(version);
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "runtime.node",
    group: "runtime",
    label: "Node.js version",
    blocking: true,
  };

  if (major === null) {
    return {
      ...base,
      status: "unknown",
      summary: `Could not parse the Node.js version string (${version || "empty"}).`,
      howToFix: [
        `Run \`node --version\` on the server and confirm it reports v${NODE_BASELINE_MAJOR} or newer.`,
      ],
    };
  }

  if (major < NODE_BASELINE_MAJOR) {
    return {
      ...base,
      status: "fail",
      summary: `Node.js ${version} is below the required baseline of ${NODE_BASELINE_MAJOR}.x.`,
      detail:
        `This platform is built and shipped on Node ${NODE_BASELINE_MAJOR} (all three Dockerfile stages use node:${NODE_BASELINE_MAJOR}-slim). ` +
        "Older majors will fail at runtime on APIs this codebase relies on rather than failing cleanly at startup.",
      howToFix: [
        `Install Node.js ${NODE_BASELINE_MAJOR} LTS (nvm: \`nvm install ${NODE_BASELINE_MAJOR} && nvm use ${NODE_BASELINE_MAJOR}\`).`,
        "If you are running in Docker, use the provided Dockerfile — it already pins the correct Node version.",
        "Restart the application after upgrading, then re-run these checks.",
      ],
    };
  }

  if (major > NODE_BASELINE_MAJOR) {
    return {
      ...base,
      status: "warn",
      summary: `Node.js ${version} is newer than the tested baseline of ${NODE_BASELINE_MAJOR}.x.`,
      detail:
        "Newer than tested is not known-broken — it is simply untested here. Nothing is blocked; this is recorded so that if something behaves oddly later, the version difference is already on the record.",
      howToFix: [
        `If you hit unexplained runtime errors, try Node ${NODE_BASELINE_MAJOR} LTS, which is what this release is verified against.`,
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `Node.js ${version} meets the ${NODE_BASELINE_MAJOR}.x baseline.`,
  };
}

export function checkNodeVersion(version: string = process.version): CheckResult {
  return evaluateNodeVersion(version);
}

export interface PackageManagerFacts {
  /** Version string reported by `pnpm --version`, or null if not runnable. */
  pnpmVersion: string | null;
  /** Version string reported by `npm --version`, or null. */
  npmVersion: string | null;
  /** The `packageManager` field from package.json, if readable. */
  declared?: string | null;
}

/**
 * pnpm is canonical here — `package.json` declares
 * `"packageManager": "pnpm@11.22.0"`, there is a `pnpm-lock.yaml` and a
 * `pnpm-workspace.yaml`, and the Dockerfile runs `pnpm install
 * --frozen-lockfile`. npm present without pnpm is a `warn`, not a `fail`:
 * the application does not need a package manager AT RUNTIME at all (the
 * container ships a built standalone server), so declaring this a hard block
 * would be false. It matters for upgrades and for `pnpm run build`.
 */
export function evaluatePackageManager(facts: PackageManagerFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "runtime.package-manager",
    group: "runtime",
    label: "Package manager",
    blocking: false,
  };
  const declared = facts.declared ?? "pnpm";

  if (facts.pnpmVersion) {
    return {
      ...base,
      status: "pass",
      summary: `pnpm ${facts.pnpmVersion} is available (this project declares ${declared}).`,
    };
  }

  if (facts.npmVersion) {
    return {
      ...base,
      status: "warn",
      summary: `pnpm was not found; npm ${facts.npmVersion} is available instead.`,
      detail:
        `This project declares ${declared} and ships a pnpm-lock.yaml. Installing with npm resolves a different dependency tree than the one this release was built and tested against. ` +
        "The already-built application still runs fine — this only affects future installs, upgrades and rebuilds.",
      howToFix: [
        "Enable pnpm via Corepack (ships with Node): `corepack enable`.",
        "Or install it directly: `npm install -g pnpm@11`.",
        "Then reinstall dependencies with `pnpm install --frozen-lockfile` so the lockfile is honoured.",
      ],
    };
  }

  return {
    ...base,
    status: "warn",
    summary: "Neither pnpm nor npm could be executed from this process.",
    detail:
      "This is expected and harmless in a production container, which ships a pre-built standalone server and has no need for a package manager. It only matters if you intend to build or upgrade on this host.",
    howToFix: [
      "If you build on this host, install Node.js (which bundles npm) and enable pnpm with `corepack enable`.",
      "If this is a production container running a pre-built image, no action is needed.",
    ],
  };
}

async function tryVersion(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, ["--version"], {
      timeout: 5000,
      windowsHide: true,
      // `shell: true` is required on Windows for `.cmd` shims (pnpm/npm are
      // batch files there). The command names are hard-coded constants in
      // this module — no user input ever reaches this call.
      shell: process.platform === "win32",
    });
    const v = stdout.trim().split("\n")[0]?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function checkPackageManager(declared?: string | null): Promise<CheckResult> {
  const [pnpmVersion, npmVersion] = await Promise.all([tryVersion("pnpm"), tryVersion("npm")]);
  return evaluatePackageManager({ pnpmVersion, npmVersion, declared });
}
