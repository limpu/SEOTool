import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstallerActionPermitted } from "@/lib/install/state";

/**
 * Web Installer — installation-state / lock tests.
 *
 * The policy under test is the heart of the security model:
 *
 *   complete     → the installer no longer exists (real 404), for reads AND
 *                  writes, and no token can reopen it.
 *   not_complete → open, still behind the install token.
 *   unknown      → NEVER treated as "not installed". Read-only diagnostics
 *                  are allowed (that is what the installer is for when the
 *                  database is broken); anything that mutates fails closed.
 */
describe("install/state — isInstallerActionPermitted", () => {
  it("refuses reads with a real 404 once installation is complete", () => {
    const r = isInstallerActionPermitted("complete", "read");
    expect(r.permitted).toBe(false);
    expect(r.httpStatus).toBe(404);
  });

  it("refuses mutations with a real 404 once installation is complete", () => {
    const r = isInstallerActionPermitted("complete", "mutate");
    expect(r.permitted).toBe(false);
    expect(r.httpStatus).toBe(404);
  });

  it("returns 404 rather than 403 when locked, so a scanner cannot confirm an installer exists here", () => {
    expect(isInstallerActionPermitted("complete", "read").httpStatus).not.toBe(403);
    expect(isInstallerActionPermitted("complete", "mutate").httpStatus).not.toBe(401);
  });

  it("permits both reads and mutations on a fresh installation", () => {
    expect(isInstallerActionPermitted("not_complete", "read").permitted).toBe(true);
    expect(isInstallerActionPermitted("not_complete", "mutate").permitted).toBe(true);
  });

  it("permits read-only diagnostics while state is unknown — that is what the installer is FOR", () => {
    const r = isInstallerActionPermitted("unknown", "read");
    expect(r.permitted).toBe(true);
    expect(r.reason).toMatch(/read-only/i);
  });

  it("refuses every mutation while state is unknown, with 503 — an unconfirmed state is never 'not installed'", () => {
    const r = isInstallerActionPermitted("unknown", "mutate");
    expect(r.permitted).toBe(false);
    expect(r.httpStatus).toBe(503);
    expect(r.reason).toMatch(/never treated as 'not installed'/i);
  });

  it("is exhaustive: every status/capability pair returns a decision", () => {
    for (const status of ["complete", "not_complete", "unknown"] as const) {
      for (const capability of ["read", "mutate"] as const) {
        const r = isInstallerActionPermitted(status, capability);
        expect(typeof r.permitted).toBe("boolean");
        expect(typeof r.httpStatus).toBe("number");
        expect(r.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("install/state — readInstallationState transitions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  async function importWithDb(select: () => unknown) {
    vi.doMock("@/lib/db", () => ({ db: { select } }));
    vi.resetModules();
    return import("@/lib/install/state");
  }

  function chain(rows: unknown[]) {
    return () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
    });
  }

  function chainThrows(err: unknown) {
    return () => ({
      from: () => ({ where: () => ({ limit: () => Promise.reject(err) }) }),
    });
  }

  it("FRESH: a seeded, not-yet-complete row reads as not_complete with no steps", async () => {
    const { readInstallationState } = await importWithDb(
      chain([{ completed: false, completedAt: null, completedByUserId: null, steps: {} }])
    );
    const s = await readInstallationState();
    expect(s.status).toBe("not_complete");
    expect(s.completed).toBe(false);
    expect(s.steps).toEqual({});
  });

  it("PARTIAL: step progress is carried through while the installation is still open", async () => {
    const steps = { database: { status: "complete", at: "2026-08-31T00:00:00.000Z" } };
    const { readInstallationState } = await importWithDb(
      chain([{ completed: false, completedAt: null, completedByUserId: null, steps }])
    );
    const s = await readInstallationState();
    expect(s.status).toBe("not_complete");
    expect(s.steps.database.status).toBe("complete");
  });

  it("COMPLETE: a completed row reads as complete and carries who completed it", async () => {
    const at = new Date("2026-08-31T12:00:00.000Z");
    const { readInstallationState } = await importWithDb(
      chain([{ completed: true, completedAt: at, completedByUserId: "user-1", steps: {} }])
    );
    const s = await readInstallationState();
    expect(s.status).toBe("complete");
    expect(s.completed).toBe(true);
    expect(s.completedAt).toBe(at.toISOString());
    expect(s.completedByUserId).toBe("user-1");
  });

  it("a reachable database with no installer schema is not_complete (a genuinely fresh database)", async () => {
    const err = Object.assign(new Error('relation "installation_state" does not exist'), {
      code: "42P01",
    });
    const { readInstallationState } = await importWithDb(chainThrows(err));
    const s = await readInstallationState();
    expect(s.status).toBe("not_complete");
    expect(s.schemaMissing).toBe(true);
  });

  it("an UNREACHABLE database is `unknown` — never `not_complete`", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), {
      code: "ECONNREFUSED",
    });
    const { readInstallationState } = await importWithDb(chainThrows(err));
    const s = await readInstallationState();
    // The single most important assertion in this file: a database outage on
    // a live system must not reopen an admin-creation endpoint.
    expect(s.status).toBe("unknown");
    expect(s.status).not.toBe("not_complete");
    expect(s.completed).toBe(false);
  });

  it("the unknown-state reason is sanitized — no connection string reaches it", async () => {
    const err = Object.assign(
      new Error("could not connect: postgresql://seo_user:MySecretPassword1@db:5432/app"),
      { code: "ECONNREFUSED" }
    );
    const { readInstallationState } = await importWithDb(chainThrows(err));
    const s = await readInstallationState();
    expect(s.reason).toBeDefined();
    expect(s.reason).not.toContain("MySecretPassword1");
  });

  it("a missing singleton row is not_complete but is flagged as the anomaly it is", async () => {
    const { readInstallationState } = await importWithDb(chain([]));
    const s = await readInstallationState();
    expect(s.status).toBe("not_complete");
    expect(s.reason).toMatch(/missing/i);
  });

  it("markInstallationComplete refuses when the installer is already complete", async () => {
    vi.doMock("@/lib/db", () => ({
      db: {
        select: chain([{ completed: true, completedAt: new Date(), completedByUserId: "u", steps: {} }]),
        update: () => {
          throw new Error("update must never be attempted once complete");
        },
      },
    }));
    vi.resetModules();
    const { markInstallationComplete } = await import("@/lib/install/state");
    await expect(markInstallationComplete("someone")).resolves.toBe(false);
  });

  it("markInstallationComplete refuses while the database state is unknown", async () => {
    vi.doMock("@/lib/db", () => ({
      db: {
        select: chainThrows(Object.assign(new Error("down"), { code: "ECONNREFUSED" })),
        update: () => {
          throw new Error("update must never be attempted while state is unknown");
        },
      },
    }));
    vi.resetModules();
    const { markInstallationComplete } = await import("@/lib/install/state");
    await expect(markInstallationComplete("someone")).resolves.toBe(false);
  });

  it("recordInstallStep refuses once the installation is complete", async () => {
    vi.doMock("@/lib/db", () => ({
      db: {
        select: chain([{ completed: true, completedAt: new Date(), completedByUserId: "u", steps: {} }]),
        update: () => {
          throw new Error("update must never be attempted once complete");
        },
      },
    }));
    vi.resetModules();
    const { recordInstallStep } = await import("@/lib/install/state");
    await expect(recordInstallStep("database", "complete")).rejects.toThrow(/cannot be recorded/i);
  });
});
