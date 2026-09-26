import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  applyEnvUpdates,
  formatEnvValue,
  mergeEnvContent,
  resolveEnvFilePath,
} from "@/lib/install/actions/env-file";
import type { DeploymentDetection } from "@/lib/install/deployment";

/**
 * Web Installer — Stage 2. Writing `.env` without destroying it.
 *
 * The preservation tests are the important ones. This repo's own `.env`
 * carries ~40 lines of comments explaining why Google and Ollama are
 * unconfigured and how to generate each key. Rewriting the file from a
 * key/value map would delete all of it — a destructive edit disguised as
 * "saving your configuration".
 */

const traditional: DeploymentDetection = {
  mode: "traditional",
  evidence: ["test"],
  envFileIsDurable: true,
  restartRequired: true,
  platform: "linux",
};
const container: DeploymentDetection = {
  mode: "container",
  evidence: ["/.dockerenv exists"],
  orchestrator: "docker",
  envFileIsDurable: false,
  restartRequired: true,
  platform: "linux",
};

const EXISTING = `# =========================================
# AI SEO Intelligence Platform — Environment
# NEVER commit this file to git.

# --- Database ---
DATABASE_URL=postgresql://seo_user:hunter2@localhost:5432/seo_platform

# --- Email ---
# For local dev, leave EMAIL_HOST unset.
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587

# GOOGLE_CLIENT_ID=commented-out-on-purpose
OLLAMA_MODEL=llama3.2
`;

describe("install/env-file — mergeEnvContent preserves everything it was not asked to change", () => {
  it("rewrites only the value of an existing key", () => {
    const r = mergeEnvContent(EXISTING, { EMAIL_PORT: "465" });
    expect(r.updated).toEqual(["EMAIL_PORT"]);
    expect(r.added).toEqual([]);
    expect(r.content).toContain("EMAIL_PORT=465");
    expect(r.content).not.toContain("EMAIL_PORT=587");
  });

  it("KEEPS every comment, blank line and unrelated variable byte-for-byte", () => {
    const r = mergeEnvContent(EXISTING, { EMAIL_PORT: "465" });
    for (const line of EXISTING.split("\n")) {
      if (line.startsWith("EMAIL_PORT=")) continue;
      if (line === "") continue;
      expect(r.content).toContain(line);
    }
    // The header comments, specifically.
    expect(r.content).toContain("# NEVER commit this file to git.");
    expect(r.content).toContain("# --- Database ---");
    expect(r.content).toContain("DATABASE_URL=postgresql://seo_user:hunter2@localhost:5432/seo_platform");
  });

  it("NEVER touches a commented-out assignment — those are documentation in this repo", () => {
    const r = mergeEnvContent(EXISTING, { GOOGLE_CLIENT_ID: "new.apps.googleusercontent.com" });
    // The commented line survives untouched...
    expect(r.content).toContain("# GOOGLE_CLIENT_ID=commented-out-on-purpose");
    // ...and the real value is APPENDED, not spliced into the comment.
    expect(r.added).toEqual(["GOOGLE_CLIENT_ID"]);
    expect(r.content).toContain("GOOGLE_CLIENT_ID=new.apps.googleusercontent.com");
  });

  it("appends genuinely new keys in one labelled block that states the restart requirement", () => {
    const r = mergeEnvContent(EXISTING, { JWT_SECRET: "abc123xyz", EMAIL_SECURE: "false" });
    expect(r.added.sort()).toEqual(["EMAIL_SECURE", "JWT_SECRET"]);
    expect(r.content).toContain("# --- Added by the AI SEO Platform web installer ---");
    expect(r.content).toContain("A RESTART IS REQUIRED");
  });

  it("reports an unchanged key rather than rewriting an identical line", () => {
    const r = mergeEnvContent(EXISTING, { EMAIL_PORT: "587" });
    expect(r.unchanged).toEqual(["EMAIL_PORT"]);
    expect(r.updated).toEqual([]);
    expect(r.content).toBe(EXISTING.replace(/\n*$/, "\n"));
  });

  it("handles an empty file (a genuine first install)", () => {
    const r = mergeEnvContent("", { DATABASE_URL: "postgresql://a:b@h/db" });
    expect(r.added).toEqual(["DATABASE_URL"]);
    expect(r.content).toContain("DATABASE_URL=postgresql://a:b@h/db");
  });

  it("preserves `export ` prefixes and leading indentation on an existing line", () => {
    const r = mergeEnvContent("  export EMAIL_PORT=25\n", { EMAIL_PORT: "587" });
    expect(r.content).toContain("  EMAIL_PORT=587");
  });

  it("does not write a duplicate assignment twice — only the first occurrence is rewritten", () => {
    const r = mergeEnvContent("A=1\nB=2\nA=3\n", { A: "9" });
    const lines = r.content.split("\n").filter((l) => l.startsWith("A="));
    expect(lines).toEqual(["A=9", "A=3"]);
  });

  it("REFUSES a key name that is not a plain environment variable name", () => {
    expect(() => mergeEnvContent("", { "A=B\nEVIL": "x" })).toThrow(/unexpected name/i);
    expect(() => mergeEnvContent("", { "": "x" })).toThrow();
  });

  it("quotes a value only when it needs quoting, so the file stays reviewable", () => {
    expect(formatEnvValue("simple-value_1")).toBe("simple-value_1");
    expect(formatEnvValue("postgresql://u:p@h:5432/db")).toBe("postgresql://u:p@h:5432/db");
    expect(formatEnvValue("has space")).toBe('"has space"');
    expect(formatEnvValue('has"quote')).toBe('"has\\"quote"');
    expect(formatEnvValue("")).toBe('""');
  });
});

describe("install/env-file — applyEnvUpdates", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "install-env-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes atomically and leaves no temp file behind", async () => {
    await fs.writeFile(path.join(root, ".env"), EXISTING, "utf8");
    const out = await applyEnvUpdates({
      projectRoot: root,
      updates: { EMAIL_PORT: "465" },
      detection: traditional,
    });
    expect(out.persisted).toBe(true);
    const written = await fs.readFile(path.join(root, ".env"), "utf8");
    expect(written).toContain("EMAIL_PORT=465");
    expect(written).toContain("# NEVER commit this file to git.");
    const leftovers = (await fs.readdir(root)).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("ALWAYS says a restart is required — a written value is not an active value", async () => {
    const out = await applyEnvUpdates({
      projectRoot: root,
      updates: { EMAIL_HOST: "smtp.example.com" },
      detection: traditional,
    });
    if (!out.persisted) throw new Error("expected a write");
    expect(out.restartRequired).toBe(true);
    expect(out.message).toMatch(/NOT active yet/i);
    expect(out.notes.join(" ")).toMatch(/RESTART IS REQUIRED/);
    expect(out.notes.join(" ")).toMatch(/only after observing it in the running process/);
  });

  it("flags a REBUILD for NEXT_PUBLIC_* — those are inlined into the client bundle at build time", async () => {
    const out = await applyEnvUpdates({
      projectRoot: root,
      updates: { NEXT_PUBLIC_APP_URL: "https://seo.example.com" },
      detection: traditional,
    });
    if (!out.persisted) throw new Error("expected a write");
    expect(out.rebuildRequired).toBe(true);
    expect(out.notes.join(" ")).toMatch(/BUILD time/);
  });

  it("IN A CONTAINER IT WRITES NOTHING and returns the injection snippet instead", async () => {
    const out = await applyEnvUpdates({
      projectRoot: root,
      updates: { EMAIL_HOST: "smtp.example.com" },
      detection: container,
    });
    expect(out.persisted).toBe(false);
    if (out.mode !== "container") throw new Error("expected container guidance");
    expect(out.snippet).toContain("environment:");
    expect(out.snippet).toContain("EMAIL_HOST");
    expect(out.dockerRunFlags).toContain("-e EMAIL_HOST=");
    expect(out.message).toMatch(/destroyed by the next redeploy/i);
    // And genuinely no file appeared.
    await expect(fs.access(path.join(root, ".env"))).rejects.toBeTruthy();
  });

  it("fails closed on an UNKNOWN deployment mode rather than writing a file that may not persist", async () => {
    const out = await applyEnvUpdates({
      projectRoot: root,
      updates: { EMAIL_HOST: "smtp.example.com" },
      detection: { ...container, mode: "unknown", orchestrator: undefined },
    });
    expect(out.persisted).toBe(false);
    await expect(fs.access(path.join(root, ".env"))).rejects.toBeTruthy();
  });

  it("refuses an empty update set instead of rewriting the file for nothing", async () => {
    const out = await applyEnvUpdates({ projectRoot: root, updates: {}, detection: traditional });
    expect(out.persisted).toBe(false);
    if (out.mode !== "error") throw new Error("expected a refusal");
    expect(out.message).toMatch(/nothing was changed/i);
  });

  it("resolves .env to the project root, and REFUSES any directory that could be served over HTTP", () => {
    expect(resolveEnvFilePath(root)).toBe(path.resolve(root, ".env"));
    // The realistic failure is projectRoot itself being wrong. An .env
    // downloadable as a static asset exposes every credential in it.
    for (const dir of ["public", "static", ".next", "dist", "build", "out"]) {
      expect(() => resolveEnvFilePath(path.join(root, dir))).toThrow(/served over HTTP/i);
    }
    // And nested, not only as the final segment.
    expect(() => resolveEnvFilePath(path.join(root, "public", "assets"))).toThrow(/served over HTTP/i);
  });

  it("applyEnvUpdates surfaces that refusal as a clean error rather than writing the file", async () => {
    const servedRoot = path.join(root, "public");
    await fs.mkdir(servedRoot, { recursive: true });
    const out = await applyEnvUpdates({
      projectRoot: servedRoot,
      updates: { EMAIL_HOST: "smtp.example.com" },
      detection: traditional,
    });
    expect(out.persisted).toBe(false);
    if (out.mode !== "error") throw new Error("expected a refusal");
    expect(out.message).toMatch(/served over HTTP/i);
    await expect(fs.access(path.join(servedRoot, ".env"))).rejects.toBeTruthy();
  });
});
