import fs from "fs/promises";
import os from "os";
import type { CheckResult } from "../types";

/**
 * Web Installer — memory and disk.
 *
 * ─── THESE WARN. THEY DO NOT BLOCK. ─────────────────────────────────────
 * An installer that refuses to proceed on a 2 GB box would be asserting a
 * requirement this product does not actually have. The application itself is
 * a Next.js server and a Postgres client; it runs on modest hardware. What
 * needs headroom is the OPTIONAL heavy work — a Lighthouse run launches a
 * real Chromium (comfortably 500 MB–1 GB resident), and a large crawl holds
 * page bodies in memory while the rule engines run.
 *
 * So the honest statement is "below 4 GB, expect PageSpeed and large crawls
 * to struggle", not "you may not install". Warn, explain what specifically
 * degrades, and let the operator decide. Blocking on a recommendation
 * dressed up as a requirement is the same category of dishonesty as
 * fabricating a metric.
 */

const GB = 1024 ** 3;
export const RECOMMENDED_MEMORY_BYTES = 4 * GB;
export const MINIMUM_PRACTICAL_MEMORY_BYTES = 2 * GB;
export const RECOMMENDED_DISK_BYTES = 20 * GB;
export const LOW_DISK_BYTES = 5 * GB;
export const CRITICAL_DISK_BYTES = 1 * GB;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${bytes} bytes`;
}

export function evaluateMemory(totalBytes: number, freeBytes?: number): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "resources.memory",
    group: "resources",
    label: "System memory",
    // Never blocking. See the module header.
    blocking: false,
  };

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return {
      ...base,
      status: "unknown",
      summary: "Total system memory could not be determined.",
      howToFix: ["Check the host's available RAM manually (`free -h` on Linux) — 4 GB is recommended."],
    };
  }

  const detail =
    `Detected ${formatBytes(totalBytes)} total` +
    (freeBytes !== undefined ? `, ${formatBytes(freeBytes)} currently free` : "") +
    `. Recommended: ${formatBytes(RECOMMENDED_MEMORY_BYTES)}; minimum practical: ${formatBytes(MINIMUM_PRACTICAL_MEMORY_BYTES)}.` +
    " In a container this reports the HOST's memory unless a cgroup limit is applied — if you have set a container memory limit, that limit is what actually applies, not the figure shown here.";

  if (totalBytes < MINIMUM_PRACTICAL_MEMORY_BYTES) {
    return {
      ...base,
      status: "warn",
      summary: `${formatBytes(totalBytes)} of RAM is below the 2 GB minimum practical requirement.`,
      detail:
        detail +
        " At this size expect PageSpeed audits (which launch a real Chromium process) to be killed by the OOM killer, and large crawls to fail partway through. The application will still start and the non-heavy modules will work.",
      howToFix: [
        "Increase the host's RAM to at least 2 GB, ideally 4 GB.",
        "Add swap space as a stopgap — it prevents outright OOM kills, at a large speed cost.",
        "If PageSpeed is not needed, the memory pressure drops substantially: Chromium is by far the largest consumer.",
      ],
    };
  }

  if (totalBytes < RECOMMENDED_MEMORY_BYTES) {
    return {
      ...base,
      status: "warn",
      summary: `${formatBytes(totalBytes)} of RAM is usable but below the recommended 4 GB.`,
      detail:
        detail +
        " This is enough to run the platform. Expect PageSpeed audits and large crawls to be slow, and avoid running both at the same time.",
      howToFix: [
        "Increase to 4 GB for comfortable headroom during PageSpeed audits and large crawls.",
        "Avoid running a crawl and a PageSpeed audit concurrently on this host.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${formatBytes(totalBytes)} of RAM meets the 4 GB recommendation.`,
    detail,
  };
}

export interface DiskFacts {
  availableBytes: number | null;
  totalBytes: number | null;
  /** Sanitized reason the measurement failed, when it did. */
  error?: string;
}

export function evaluateDisk(facts: DiskFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "resources.disk",
    group: "resources",
    label: "Disk space",
    blocking: false,
  };

  const consumers =
    "Disk here is consumed by crawl results (page HTML, headings and link graphs are persisted per crawled page), generated reports, PostgreSQL's own data directory and WAL, and Lighthouse's temporary Chrome user-data directories, which are written on every PageSpeed audit and can be hundreds of megabytes each before they are cleaned up.";

  if (facts.availableBytes === null) {
    return {
      ...base,
      status: "unknown",
      summary: "Available disk space could not be determined on this platform.",
      detail: facts.error ? `${consumers} Measurement failed: ${facts.error}` : consumers,
      howToFix: [
        "Check free space manually (`df -h` on Linux, `Get-PSDrive` on Windows). At least 5 GB free is recommended, 20 GB for comfort.",
      ],
    };
  }

  const detail =
    `${formatBytes(facts.availableBytes)} available` +
    (facts.totalBytes ? ` of ${formatBytes(facts.totalBytes)} total` : "") +
    `. ${consumers}`;

  if (facts.availableBytes < CRITICAL_DISK_BYTES) {
    return {
      ...base,
      status: "warn",
      summary: `Only ${formatBytes(facts.availableBytes)} of disk space is available — this is critically low.`,
      detail:
        detail +
        " At this level PostgreSQL can refuse writes outright and crawls will fail partway through, leaving partial results.",
      howToFix: [
        "Free space immediately, or attach a larger volume.",
        "Old crawl runs are the largest reclaimable data — deleting historical runs for websites you no longer track frees the most.",
        "Check for orphaned Chrome user-data directories in the system temp directory left by interrupted PageSpeed audits.",
        "Run `VACUUM FULL` on the database if a lot of data has been deleted but space was not returned to the filesystem.",
      ],
    };
  }

  if (facts.availableBytes < LOW_DISK_BYTES) {
    return {
      ...base,
      status: "warn",
      summary: `${formatBytes(facts.availableBytes)} of disk space is available — below the 5 GB comfortable minimum.`,
      detail,
      howToFix: [
        "Free space or expand the volume before running large crawls.",
        "Prune historical crawl runs you no longer need.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${formatBytes(facts.availableBytes)} of disk space is available.`,
    detail,
  };
}

export function checkMemory(): CheckResult {
  return evaluateMemory(os.totalmem(), os.freemem());
}

export async function checkDisk(targetPath: string = process.cwd()): Promise<CheckResult> {
  try {
    // `fs.statfs` is available from Node 18.15 / 19.6 and works on both
    // Linux and Windows. Node 24 is this project's baseline, so it is always
    // present — but the try/catch stays, because it throws on some network
    // and overlay filesystems, and "we could not measure it" must remain a
    // reportable state rather than an exception.
    const stats = await fs.statfs(targetPath);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const total = Number(stats.blocks) * Number(stats.bsize);
    return evaluateDisk({ availableBytes: available, totalBytes: total });
  } catch (err) {
    return evaluateDisk({
      availableBytes: null,
      totalBytes: null,
      error: err instanceof Error ? err.message.slice(0, 120) : undefined,
    });
  }
}
