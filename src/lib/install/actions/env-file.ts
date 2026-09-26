import fs from "fs/promises";
import path from "path";
import { detectDeploymentMode, renderConfigGuidance, type DeploymentDetection } from "../deployment";
import { sanitizeError } from "../redact";

/**
 * Web Installer — Stage 2. Persisting configuration, honestly.
 *
 * Stage 1 established two facts this module is built around and refuses to
 * work around (see `../deployment.ts`):
 *
 *   1. WRITING `.env` DOES NOT RELOAD `process.env`. Next.js reads it once at
 *      process start. So a successful write means "the file now says this",
 *      never "the running server now uses this". Every result from this
 *      module says so, and the wizard RE-RUNS THE RELEVANT CHECK afterwards
 *      rather than reporting success on the strength of its own write.
 *   2. IN A CONTAINER THE FILE IS EPHEMERAL. It is destroyed by the next
 *      redeploy. So in container mode this module writes NOTHING and returns
 *      the exact environment block to inject instead. Handing the operator
 *      the right snippet is a complete answer; writing a file that will
 *      vanish is a lie with a delay on it.
 *
 * ─── PRESERVING WHAT IS ALREADY THERE ───────────────────────────────────
 * `.env` is a hand-maintained file. In THIS repo it carries ~40 lines of
 * comments explaining why Google and Ollama are unconfigured, how to generate
 * each key, and what each block is for. Rewriting the file from a key/value
 * map would delete all of that — a destructive edit disguised as a
 * configuration save. `mergeEnvContent` is therefore line-preserving: it
 * rewrites the VALUE of a key that already has a line, leaves every other
 * line (comments, blank lines, ordering, unrelated keys) byte-identical, and
 * appends genuinely new keys in one clearly-labelled block at the end.
 */

/** Keys are conventional shell-style names; anything else is refused. */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Quote a value only when it needs it. Bare values keep the file readable and
 * diffable — which matters, because an operator has to be able to review what
 * this installer did to their `.env`.
 */
export function formatEnvValue(value: string): string {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  // Double quotes with backslash escaping — the form dotenv parses back.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface EnvMergeResult {
  content: string;
  /** Keys whose existing line was rewritten. */
  updated: string[];
  /** Keys that had no line and were appended. */
  added: string[];
  /** Keys already holding exactly this value — no line was touched. */
  unchanged: string[];
}

/**
 * Merge `updates` into an existing `.env` body.
 *
 * Pure and synchronous so the preservation guarantee is directly testable
 * without touching a filesystem. Never logs, never inspects values beyond
 * formatting them.
 */
export function mergeEnvContent(
  existing: string,
  updates: Record<string, string>
): EnvMergeResult {
  const keys = Object.keys(updates);
  for (const k of keys) {
    if (!ENV_KEY_RE.test(k)) {
      throw new Error(`Refusing to write an environment key with an unexpected name: ${k}`);
    }
  }

  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const seen = new Set<string>();

  const outLines = lines.map((line) => {
    // Only an assignment line is ever a candidate. A comment stays a comment
    // even when it mentions the key — commented-out defaults are documentation
    // in this repo and must survive untouched.
    const m = /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m) return line;
    const key = m[2];
    if (!(key in updates)) return line;
    if (seen.has(key)) {
      // A duplicate assignment later in the file would win at parse time, so
      // the first one is already dead. Leave it exactly as it is rather than
      // writing the new value twice.
      return line;
    }
    seen.add(key);
    const nextLine = `${m[1]}${key}=${formatEnvValue(updates[key])}`;
    if (nextLine === line) {
      unchanged.push(key);
      return line;
    }
    updated.push(key);
    return nextLine;
  });

  const added = keys.filter((k) => !seen.has(k));

  if (added.length > 0) {
    // Trim trailing blank lines so repeated appends do not accumulate gaps.
    while (outLines.length > 0 && outLines[outLines.length - 1].trim() === "") outLines.pop();
    if (outLines.length > 0) outLines.push("");
    outLines.push(
      "# --- Added by the AI SEO Platform web installer ---",
      "# A RESTART IS REQUIRED before these values take effect: Next.js reads",
      "# .env once at process start and never reloads process.env at runtime.",
      ...added.map((k) => `${k}=${formatEnvValue(updates[k])}`)
    );
  }

  return {
    content: outLines.join("\n").replace(/\n*$/, "\n"),
    updated,
    added,
    unchanged,
  };
}

export type EnvWriteOutcome =
  | {
      persisted: true;
      mode: "traditional" | "unknown";
      updated: string[];
      added: string[];
      unchanged: string[];
      restartRequired: true;
      /** True when at least one written key is inlined into the client bundle. */
      rebuildRequired: boolean;
      message: string;
      notes: string[];
    }
  | {
      persisted: false;
      mode: "container";
      /** The exact block to inject, VALUES INCLUDED — this is the operator's own input. */
      snippet: string;
      dockerRunFlags: string;
      keys: string[];
      message: string;
      notes: string[];
    }
  | {
      persisted: false;
      mode: "error";
      message: string;
      howToFix: string[];
    };

/**
 * Directory names that are, or can be, served to the public over HTTP in a
 * Next.js deployment. A `.env` written into any of them is not a
 * misconfiguration, it is a total compromise: the file is then downloadable
 * by anyone who guesses the URL.
 */
const PUBLICLY_SERVED_DIR_NAMES = new Set(["public", "static", ".next", "dist", "build", "out"]);

/**
 * Where `.env` lives, with the one check that matters.
 *
 * The realistic way this goes wrong is not a caller asking for
 * `public/.env` — nothing does — it is `projectRoot` itself being wrong,
 * because the process was started from a served directory or a future caller
 * passed a subdirectory. So the check is on the RESOLVED DESTINATION's own
 * path segments, not on a relationship between two paths the caller supplied.
 */
export function resolveEnvFilePath(projectRoot: string): string {
  const target = path.resolve(projectRoot, ".env");
  const segments = path.dirname(target).split(/[\\/]/).filter(Boolean);
  const offending = segments.find((s) => PUBLICLY_SERVED_DIR_NAMES.has(s));
  if (offending) {
    throw new Error(
      `Refusing to write .env inside a directory that may be served over HTTP ("${offending}"). An .env reachable as a static asset would expose every credential in it.`
    );
  }
  return target;
}

const CLIENT_INLINED_PREFIX = "NEXT_PUBLIC_";

/**
 * Apply configuration values for the detected deployment mode.
 *
 * In `container` mode nothing is written and the exact injection snippet is
 * returned. In `traditional` (and `unknown`, which is handled the same way
 * but says it could not tell) the file is written ATOMICALLY: a temp file in
 * the same directory, `mode 0o600`, then `rename`. A half-written `.env`
 * would leave the application unable to start at all, which is a far worse
 * outcome than a failed save, and `rename` within a directory is atomic on
 * both POSIX and NTFS.
 */
export async function applyEnvUpdates(opts: {
  projectRoot: string;
  updates: Record<string, string>;
  detection?: DeploymentDetection;
}): Promise<EnvWriteOutcome> {
  const detection = opts.detection ?? detectDeploymentMode();
  const keys = Object.keys(opts.updates);
  const rebuildRequired = keys.some((k) => k.startsWith(CLIENT_INLINED_PREFIX));

  if (keys.length === 0) {
    return {
      persisted: false,
      mode: "error",
      message: "No configuration values were supplied, so nothing was changed.",
      howToFix: ["Fill in at least one field before saving."],
    };
  }

  if (detection.mode === "container" || !detection.envFileIsDurable) {
    const guidance = renderConfigGuidance(detection, keys);
    return {
      persisted: false,
      mode: "container",
      snippet: [
        "services:",
        "  app:",
        "    environment:",
        ...keys.map((k) => `      ${k}: ${JSON.stringify(opts.updates[k])}`),
      ].join("\n"),
      dockerRunFlags: keys
        .map((k) => `-e ${k}=${JSON.stringify(opts.updates[k])}`)
        .join(" \\\n   "),
      keys,
      message:
        detection.mode === "container"
          ? "This instance is running inside a container, so nothing was written to a file. A .env written inside a container is destroyed by the next redeploy — it would look like it worked and then silently vanish. Inject these values through your orchestrator instead."
          : "The deployment type could not be determined, so no file was written. Writing a file that may not persist would produce configuration that appears to work and then disappears.",
      notes: guidance.steps,
    };
  }

  let target: string;
  try {
    target = resolveEnvFilePath(opts.projectRoot);
  } catch (err) {
    return {
      persisted: false,
      mode: "error",
      message: sanitizeError(err),
      howToFix: [
        "The .env file must live in the application's project root, never inside a directory served over HTTP.",
      ],
    };
  }

  let existing = "";
  try {
    // `turbopackIgnore` because the path is genuinely dynamic — it is the
    // operator's own project root, not a build-time constant. Without the
    // hint the bundler traces the entire project into the server output "just
    // in case", which would ship every source file, and the public folder,
    // with the deployed application. The read itself is deliberate and
    // correct: the installer must merge into the REAL .env, not a copy.
    existing = await fs.readFile(/* turbopackIgnore: true */ target, "utf8");
  } catch {
    // No `.env` yet is a completely normal first-install state.
    existing = "";
  }

  let merged: EnvMergeResult;
  try {
    merged = mergeEnvContent(existing, opts.updates);
  } catch (err) {
    return {
      persisted: false,
      mode: "error",
      message: sanitizeError(err),
      howToFix: ["Only standard environment-variable names (A-Z, 0-9, underscore) can be written."],
    };
  }

  const tmp = `${target}.installer-${process.pid}-${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, merged.content, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, target);
    // `rename` preserves the destination's inode permissions on some
    // platforms, so re-assert 0600 on the final path. Best-effort: Windows
    // ignores POSIX modes entirely, which Stage 1 already reports honestly
    // rather than claiming a protection that was not applied.
    await fs.chmod(target, 0o600).catch(() => {});
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    return {
      persisted: false,
      mode: "error",
      message: `The .env file could not be written: ${sanitizeError(err)}`,
      howToFix: [
        "Check that the application's user can write to the project root.",
        "If the filesystem is read-only, set these variables through your process manager or orchestrator instead.",
      ],
    };
  }

  const notes = [
    "A RESTART IS REQUIRED. Next.js reads .env once at process start, so the running server still holds the previous values until it restarts (`systemctl restart <service>` / `pm2 restart <app>`).",
    "This installer reports a value as active only after observing it in the running process — never merely because it was written. Re-run the checks after restarting.",
    "Comments, blank lines and every unrelated variable in your .env were left exactly as they were.",
  ];
  if (rebuildRequired) {
    notes.push(
      "One or more of these variables is a NEXT_PUBLIC_* value, which is inlined into the client bundle at BUILD time. Those additionally require `pnpm run build` before the restart — a restart alone will not change them."
    );
  }

  return {
    persisted: true,
    mode: detection.mode === "traditional" ? "traditional" : "unknown",
    updated: merged.updated,
    added: merged.added,
    unchanged: merged.unchanged,
    restartRequired: true,
    rebuildRequired,
    message: `${merged.updated.length + merged.added.length} value(s) were written to .env. They are NOT active yet — the application must be restarted first.`,
    notes,
  };
}
