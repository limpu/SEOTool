import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  INSTALL_TOKEN_FILENAME,
  __resetTokenLogGuardForTests,
  ensureInstallToken,
  generateInstallToken,
  getInstallTokenPath,
  readInstallTokenFromDisk,
  timingSafeEqualStrings,
  tokenFingerprint,
  verifyInstallToken,
} from "@/lib/install/token";

/**
 * Web Installer — install-token tests.
 *
 * The token is the ONLY thing standing between a not-yet-locked `/install`
 * and an unauthenticated remote administrator-creation endpoint (the
 * WordPress-install race). These tests cover generation quality, the
 * constant-time comparison and — most importantly — every way a wrong or
 * absent token must be rejected.
 *
 * Every test runs against a throwaway directory, never the real project root,
 * so the developer's own `.install-token` is never read, written or deleted.
 */
describe("install/token — generation", () => {
  it("produces a base64url token with at least 32 bytes of entropy", () => {
    const t = generateInstallToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet: no +, /, or =
    // 32 bytes base64url-encodes to 43 characters.
    expect(t.length).toBe(43);
    expect(Buffer.from(t, "base64url").length).toBe(32);
  });

  it("never repeats — 500 tokens are 500 distinct values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateInstallToken());
    expect(seen.size).toBe(500);
  });

  it("produces a fingerprint that is short, stable, and not reversible to the token", () => {
    const t = generateInstallToken();
    const fp = tokenFingerprint(t);
    expect(fp).toHaveLength(12);
    expect(fp).toBe(tokenFingerprint(t));
    expect(t).not.toContain(fp);
    expect(fp).not.toContain(t.slice(0, 12));
  });
});

describe("install/token — timing-safe comparison", () => {
  it("accepts an identical string", () => {
    const t = generateInstallToken();
    expect(timingSafeEqualStrings(t, t)).toBe(true);
  });

  it("rejects a different string of the SAME length without throwing", () => {
    const a = "a".repeat(43);
    const b = `${"a".repeat(42)}b`;
    expect(timingSafeEqualStrings(a, b)).toBe(false);
  });

  it("rejects a length mismatch rather than throwing — timingSafeEqual throws on unequal lengths", () => {
    // This is the specific bug the length guard exists to prevent: without
    // it, a short submitted token produces ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
    // and the route returns 500 instead of a clean rejection.
    expect(() => timingSafeEqualStrings("short", generateInstallToken())).not.toThrow();
    expect(timingSafeEqualStrings("short", generateInstallToken())).toBe(false);
    expect(timingSafeEqualStrings(generateInstallToken(), "short")).toBe(false);
  });

  it("rejects empty strings, including empty-vs-empty", () => {
    expect(timingSafeEqualStrings("", "")).toBe(false);
    expect(timingSafeEqualStrings("", generateInstallToken())).toBe(false);
  });

  it("rejects non-string input instead of throwing", () => {
    expect(timingSafeEqualStrings(undefined as unknown as string, "x")).toBe(false);
    expect(timingSafeEqualStrings(null as unknown as string, "x")).toBe(false);
  });
});

describe("install/token — persistence and verification", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "install-token-test-"));
    __resetTokenLogGuardForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("generates and persists a token on first call, and reuses it afterwards", async () => {
    const first = await ensureInstallToken(dir);
    expect(first.created).toBe(true);

    const onDisk = await readInstallTokenFromDisk(dir);
    expect(onDisk).toBe(first.token);

    // Idempotent: an operator may already have copied this token, so a
    // second call must never rotate it.
    const second = await ensureInstallToken(dir);
    expect(second.created).toBe(false);
    expect(second.token).toBe(first.token);
  });

  it("logs the token exactly once per process so Docker operators can read it from `docker logs`", async () => {
    const spy = vi.spyOn(console, "log");
    const { token } = await ensureInstallToken(dir);
    await ensureInstallToken(dir);
    await ensureInstallToken(dir);
    const printed = spy.mock.calls.filter((c) => String(c[0]).includes(token));
    expect(printed).toHaveLength(1);
  });

  it("writes the token file with 0600 on POSIX platforms", async () => {
    await ensureInstallToken(dir);
    const stat = await fs.stat(getInstallTokenPath(dir));
    if (process.platform !== "win32") {
      expect(stat.mode & 0o777).toBe(0o600);
    } else {
      // Windows ignores POSIX modes. Asserted as a documented fact rather
      // than skipped silently — production for this product is Linux.
      expect(stat.isFile()).toBe(true);
    }
  });

  it("verifies the correct token", async () => {
    const { token } = await ensureInstallToken(dir);
    await expect(verifyInstallToken(token, dir)).resolves.toBe(true);
    await expect(verifyInstallToken(` ${token}\n`, dir)).resolves.toBe(true);
  });

  it("rejects a wrong token, an empty token, a null token and a near-miss", async () => {
    const { token } = await ensureInstallToken(dir);
    await expect(verifyInstallToken(generateInstallToken(), dir)).resolves.toBe(false);
    await expect(verifyInstallToken("", dir)).resolves.toBe(false);
    await expect(verifyInstallToken(null, dir)).resolves.toBe(false);
    await expect(verifyInstallToken(undefined, dir)).resolves.toBe(false);
    // One character different, same length — the case the constant-time
    // comparison exists for.
    await expect(verifyInstallToken(`${token.slice(0, -1)}Z`, dir)).resolves.toBe(false);
    // Prefix of the real token must not verify.
    await expect(verifyInstallToken(token.slice(0, 20), dir)).resolves.toBe(false);
  });

  it("rejects EVERY token when no token file exists — absence never means 'allow'", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "install-token-empty-"));
    try {
      expect(await readInstallTokenFromDisk(emptyDir)).toBeNull();
      await expect(verifyInstallToken(generateInstallToken(), emptyDir)).resolves.toBe(false);
      await expect(verifyInstallToken("anything", emptyDir)).resolves.toBe(false);
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it("treats a token file containing only whitespace as no token at all", async () => {
    await fs.writeFile(path.join(dir, INSTALL_TOKEN_FILENAME), "   \n  ");
    expect(await readInstallTokenFromDisk(dir)).toBeNull();
    await expect(verifyInstallToken("   ", dir)).resolves.toBe(false);
  });
});
