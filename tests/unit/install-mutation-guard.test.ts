import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { z } from "zod";
import { INSTALL_TOKEN_HEADER } from "@/lib/install/token";

/**
 * Web Installer — Stage 2. Every mutation route goes through ONE wrapper, and
 * this file asserts what that wrapper guarantees.
 *
 * Stage 1's note is sharper now that routes can actually change things: the
 * failure mode for a guard is not a wrong check, it is a route that forgot to
 * call it. So the wrapper is the only way to write a mutating installer
 * route, and these tests hold it to the whole Stage 1 model:
 *
 *   complete  → 404 for a mutation, even holding a perfectly valid token
 *   unknown   → 503, FAILING CLOSED (a read would have been allowed; a
 *               mutation is not — an unconfirmed state is never "not
 *               installed")
 *   no token  → 401, and validation never runs, so a prober cannot learn the
 *               route's body shape
 *   thrown    → a fixed sentence, never a stack trace, never a secret
 */

let tmpRoot: string;
let originalCwd: string;

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/install/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const openRow = [{ completed: false, completedAt: null, completedByUserId: null, steps: {} }];
const completedRow = [
  { completed: true, completedAt: new Date("2026-08-31T00:00:00Z"), completedByUserId: "u1", steps: {} },
];

/**
 * `unreachable` is modelled the way it really happens: the query THROWS with a
 * driver error that carries the connection string, which is also why the
 * sanitization assertions below matter.
 */
function dbMock(rows: unknown[] | "unreachable") {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              if (rows === "unreachable") {
                return Promise.reject(
                  new Error(
                    "connect ECONNREFUSED 127.0.0.1:5432 for postgresql://seo_user:hunter2@localhost:5432/seo_platform"
                  )
                );
              }
              return Promise.resolve(rows);
            },
          }),
        }),
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
}

async function loadHelpers(rows: unknown[] | "unreachable") {
  vi.doMock("@/lib/db", () => dbMock(rows));
  vi.doMock("@/lib/install/rate-limit", () => ({
    checkInstallTokenRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, degraded: false }),
    clearInstallTokenRateLimit: vi.fn().mockResolvedValue(undefined),
  }));
  vi.resetModules();
  return import("@/lib/install/actions/route-helpers");
}

const schema = z.object({ token: z.string().optional(), recipient: z.string().min(3) });

describe("install — the mutation wrapper", () => {
  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "install-mutate-"));
    process.chdir(tmpRoot);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
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

  const okHandler = async () => {
    const { installerJson } = await import("@/lib/install/actions/route-helpers");
    return installerJson({ ran: true });
  };

  it("runs the handler for a valid token while installation is open", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      okHandler,
      "test"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: true });
  });

  it("REFUSES A MUTATION WITH 404 ONCE COMPLETE — even holding a perfectly valid token", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers(completedRow);
    let handlerRan = false;
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      async () => {
        handlerRan = true;
        return okHandler();
      },
      "test"
    );
    expect(res.status).toBe(404);
    expect(handlerRan).toBe(false);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found." });
    // A genuine 404 — nothing hints that an installer ever existed here.
    expect(JSON.stringify(body)).not.toMatch(/install/i);
  });

  it("FAILS CLOSED WITH 503 WHEN INSTALLATION STATE IS UNKNOWN — a mutation is never run on an unconfirmed state", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers("unreachable");
    let handlerRan = false;
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      async () => {
        handlerRan = true;
        return okHandler();
      },
      "test"
    );
    expect(res.status).toBe(503);
    expect(handlerRan).toBe(false);
    const body = await res.json();
    expect(body.error).toMatch(/never treated as 'not installed'/);
    // The refusal reason must not carry the credential the driver leaked.
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("the SAME unknown state still permits a READ — the split is by capability, not by route", async () => {
    const token = await writeToken();
    vi.doMock("@/lib/db", () => dbMock("unreachable"));
    vi.doMock("@/lib/install/rate-limit", () => ({
      checkInstallTokenRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, degraded: false }),
      clearInstallTokenRateLimit: vi.fn().mockResolvedValue(undefined),
    }));
    vi.resetModules();
    const { guardInstallerRequest } = await import("@/lib/install/guard");
    const read = await guardInstallerRequest(
      makeRequest({}, { [INSTALL_TOKEN_HEADER]: token }),
      { capability: "read" }
    );
    expect(read.ok).toBe(true);
  });

  it("returns 401 without a token, and DOES NOT VALIDATE THE BODY FIRST", async () => {
    await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    // A body that would definitely fail validation. The response must still be
    // 401 — otherwise a prober learns the route exists and what it expects.
    const res = await withInstallerMutation(makeRequest({ nonsense: true }), schema, okHandler, "test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/valid install token is required/i);
    expect(body.fieldErrors).toBeUndefined();
  });

  it("returns 401 for a WRONG token with a body that would have validated", async () => {
    await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: "A".repeat(43) }),
      schema,
      okHandler,
      "test"
    );
    expect(res.status).toBe(401);
  });

  it("feeds a malformed body to the guard as 'no token' so junk cannot bypass the rate limiter", async () => {
    await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(makeRequest("{not json", {}), schema, okHandler, "test");
    // 401, NOT 400 — it consumed limiter budget like any other wrong guess.
    expect(res.status).toBe(401);
  });

  it("validates only after the guard passes, and returns field-level messages", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(
      makeRequest({ recipient: "x" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      okHandler,
      "test"
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.recipient).toBeTruthy();
  });

  it("SANITIZES A THROWN ERROR — no stack trace, no connection string, no secret reaches the client", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      async () => {
        throw new Error(
          "password authentication failed for postgresql://seo_user:hunter2@localhost:5432/seo_platform"
        );
      },
      "test"
    );
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("postgresql://");
    expect(text).not.toMatch(/\bat .*\.ts:\d+/);
    expect(text).not.toContain("Error:");
    // It is a fixed sentence that points at the server log, on purpose.
    expect(text).toMatch(/deliberately not returned here/);
  });

  it("sanitizes the SERVER LOG line too — this project's own log is not a safe home for a credential", async () => {
    const token = await writeToken();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { withInstallerMutation } = await loadHelpers(openRow);
    await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      async () => {
        throw new Error("failed: postgresql://seo_user:hunter2@localhost:5432/seo_platform");
      },
      "test"
    );
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("hunter2");
  });

  it("marks every response no-store and noindex", async () => {
    const token = await writeToken();
    const { withInstallerMutation } = await loadHelpers(openRow);
    const res = await withInstallerMutation(
      makeRequest({ recipient: "ops@example.com" }, { [INSTALL_TOKEN_HEADER]: token }),
      schema,
      okHandler,
      "test"
    );
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(res.headers.get("X-Robots-Tag")).toMatch(/noindex/);
  });
});
