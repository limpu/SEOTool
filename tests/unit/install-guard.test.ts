import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { INSTALL_TOKEN_HEADER } from "@/lib/install/token";

/**
 * Web Installer — route-guard tests.
 *
 * These assert the security model as a whole, through the one function every
 * installer route calls:
 *
 *   - installation complete  → 404, for reads and writes, WITH or WITHOUT a
 *     valid token. Deleting the token file, clearing a cookie, or holding a
 *     perfectly good token cannot reopen it, because the lock is in the
 *     database and is checked FIRST.
 *   - no / wrong token       → 401, with one identical message for all
 *     failure modes.
 *   - too many wrong guesses → 429.
 *   - valid token, open      → allowed.
 */
let tmpRoot: string;
let originalCwd: string;

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/install/status", { headers });
}

function stateMock(rows: unknown[]) {
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
}

const openRow = [{ completed: false, completedAt: null, completedByUserId: null, steps: {} }];
const completedRow = [
  { completed: true, completedAt: new Date("2026-08-31T00:00:00Z"), completedByUserId: "u1", steps: {} },
];

async function loadGuard(rows: unknown[], rateLimitAllowed = true) {
  vi.doMock("@/lib/db", () => stateMock(rows));
  vi.doMock("@/lib/install/rate-limit", () => ({
    checkInstallTokenRateLimit: vi.fn().mockResolvedValue(
      rateLimitAllowed
        ? { allowed: true, remaining: 4, degraded: false }
        : { allowed: false, remaining: 0, retryAfterSeconds: 900, degraded: false }
    ),
    clearInstallTokenRateLimit: vi.fn().mockResolvedValue(undefined),
  }));
  vi.resetModules();
  return import("@/lib/install/guard");
}

describe("install/guard", () => {
  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "install-guard-"));
    process.chdir(tmpRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/install/rate-limit");
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function writeToken(): Promise<string> {
    const { ensureInstallToken } = await import("@/lib/install/token");
    const { token } = await ensureInstallToken(tmpRoot);
    return token;
  }

  it("allows a read with a valid token while installation is open", async () => {
    const token = await writeToken();
    const { guardInstallerRequest } = await loadGuard(openRow);
    const res = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: token }), {
      capability: "read",
    });
    expect(res.ok).toBe(true);
  });

  it("REFUSES WITH 404 once installation is complete — even holding a perfectly valid token", async () => {
    const token = await writeToken();
    const { guardInstallerRequest } = await loadGuard(completedRow);
    const res = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: token }), {
      capability: "read",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.response.status).toBe(404);
    const body = await res.response.json();
    // A genuine 404 body — no hint that an installer ever lived here.
    expect(body.error).toBe("Not found.");
    expect(JSON.stringify(body)).not.toMatch(/install/i);
  });

  it("refuses mutations with 404 once complete", async () => {
    const token = await writeToken();
    const { guardInstallerRequest } = await loadGuard(completedRow);
    const res = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: token }), {
      capability: "mutate",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });

  it("DELETING THE TOKEN FILE DOES NOT REOPEN A COMPLETED INSTALLATION", async () => {
    await writeToken();
    await fs.rm(path.join(tmpRoot, ".install-token"), { force: true });
    const { guardInstallerRequest } = await loadGuard(completedRow);
    const res = await guardInstallerRequest(makeRequest(), { capability: "read" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });

  it("returns 401 with no token, and the identical message for a WRONG token", async () => {
    await writeToken();
    const { guardInstallerRequest } = await loadGuard(openRow);

    const noToken = await guardInstallerRequest(makeRequest(), { capability: "read" });
    expect(noToken.ok).toBe(false);
    if (noToken.ok) throw new Error("unreachable");
    expect(noToken.response.status).toBe(401);
    const noTokenBody = await noToken.response.json();

    const wrongToken = await guardInstallerRequest(
      makeRequest({ [INSTALL_TOKEN_HEADER]: "A".repeat(43) }),
      { capability: "read" }
    );
    expect(wrongToken.ok).toBe(false);
    if (wrongToken.ok) throw new Error("unreachable");
    const wrongTokenBody = await wrongToken.response.json();

    // Identical messages: distinguishing "absent" from "wrong" from "no token
    // file exists" tells a prober which situation they are in.
    expect(wrongTokenBody.error).toBe(noTokenBody.error);
  });

  it("accepts the token from a cookie as well as a header", async () => {
    const token = await writeToken();
    const { guardInstallerRequest } = await loadGuard(openRow);
    const res = await guardInstallerRequest(makeRequest({ cookie: `install_token=${token}` }), {
      capability: "read",
    });
    expect(res.ok).toBe(true);
  });

  it("accepts a token supplied in the request body (the verify-token submission path)", async () => {
    const token = await writeToken();
    const { guardInstallerRequest } = await loadGuard(openRow);
    const res = await guardInstallerRequest(makeRequest(), { capability: "read", bodyToken: token });
    expect(res.ok).toBe(true);
  });

  it("returns 429 with Retry-After when the token rate limit is exhausted", async () => {
    await writeToken();
    const { guardInstallerRequest } = await loadGuard(openRow, false);
    const res = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: "wrong" }), {
      capability: "read",
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.response.status).toBe(429);
    expect(res.response.headers.get("Retry-After")).toBe("900");
  });

  it("checks the LOCK BEFORE the rate limit, so a locked installer is not a guessing oracle", async () => {
    await writeToken();
    // Rate limit exhausted AND installation complete: the answer must be the
    // 404, not the 429 — the lock is evaluated first and the token path is
    // never reached at all.
    const { guardInstallerRequest } = await loadGuard(completedRow, false);
    const res = await guardInstallerRequest(makeRequest(), { capability: "read" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
  });

  it("returns 503 for a mutation while the database is unreachable, and never 'not installed'", async () => {
    const token = await writeToken();
    vi.doMock("@/lib/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })),
            }),
          }),
        }),
        delete: () => ({ where: () => Promise.resolve() }),
      },
    }));
    vi.doMock("@/lib/install/rate-limit", () => ({
      checkInstallTokenRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, degraded: true }),
      clearInstallTokenRateLimit: vi.fn().mockResolvedValue(undefined),
    }));
    vi.resetModules();
    const { guardInstallerRequest } = await import("@/lib/install/guard");

    const mutate = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: token }), {
      capability: "mutate",
    });
    expect(mutate.ok).toBe(false);
    if (!mutate.ok) expect(mutate.response.status).toBe(503);

    // ...but read-only diagnostics still work, which is the entire point.
    const read = await guardInstallerRequest(makeRequest({ [INSTALL_TOKEN_HEADER]: token }), {
      capability: "read",
    });
    expect(read.ok).toBe(true);
  });
});

describe("install/rate-limit — in-memory fallback when the database is down", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/auth/rate-limit");
    vi.doUnmock("@/lib/db");
  });

  it("keeps metering guesses when the DB-backed limiter throws", async () => {
    vi.doMock("@/lib/auth/rate-limit", () => ({
      checkRateLimit: vi.fn().mockRejectedValue(new Error("db down")),
    }));
    vi.doMock("@/lib/db", () => ({ db: { delete: () => ({ where: () => Promise.resolve() }) } }));
    vi.resetModules();
    const { checkInstallTokenRateLimit, __resetInstallRateLimitFallbackForTests } = await import(
      "@/lib/install/rate-limit"
    );
    __resetInstallRateLimitFallbackForTests();

    const results = [];
    for (let i = 0; i < 6; i += 1) results.push(await checkInstallTokenRateLimit("install:1.2.3.4"));

    expect(results.every((r) => r.degraded)).toBe(true);
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    // Sixth guess is blocked — an attacker cannot get unlimited attempts by
    // taking the database offline.
    expect(results[5].allowed).toBe(false);
    expect(results[5].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys the fallback per client, so one attacker cannot lock out the operator", async () => {
    vi.doMock("@/lib/auth/rate-limit", () => ({
      checkRateLimit: vi.fn().mockRejectedValue(new Error("db down")),
    }));
    vi.doMock("@/lib/db", () => ({ db: { delete: () => ({ where: () => Promise.resolve() }) } }));
    vi.resetModules();
    const { checkInstallTokenRateLimit, __resetInstallRateLimitFallbackForTests } = await import(
      "@/lib/install/rate-limit"
    );
    __resetInstallRateLimitFallbackForTests();

    for (let i = 0; i < 6; i += 1) await checkInstallTokenRateLimit("install:attacker");
    const operator = await checkInstallTokenRateLimit("install:operator");
    expect(operator.allowed).toBe(true);
  });
});
