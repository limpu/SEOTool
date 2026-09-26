import { describe, expect, it, afterEach, vi } from "vitest";

describe("validateEnv (Phase 34: fail-fast startup validation)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("passes when DATABASE_URL and JWT_SECRET are present and valid", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5433/db";
    process.env.JWT_SECRET = "a".repeat(32);
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws a single aggregated error listing every missing required var", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    let error: Error | undefined;
    try {
      validateEnv();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/DATABASE_URL/);
    expect(error!.message).toMatch(/JWT_SECRET/);
  });

  it("rejects a DATABASE_URL that isn't a postgres connection string", async () => {
    process.env.DATABASE_URL = "mysql://user:pass@localhost/db";
    process.env.JWT_SECRET = "a".repeat(32);
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    expect(() => validateEnv()).toThrow(/postgres/i);
  });

  it("rejects a JWT_SECRET shorter than 32 characters", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5433/db";
    process.env.JWT_SECRET = "too-short";
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    expect(() => validateEnv()).toThrow(/32 characters/);
  });

  it("does not require optional feature-scoped vars (GSC/AI/email) to be set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5433/db";
    process.env.JWT_SECRET = "a".repeat(32);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.OLLAMA_MODEL;
    delete process.env.EMAIL_HOST;
    vi.resetModules();
    const { validateEnv } = await import("@/lib/env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("memoizes the result — only validates once per process unless reset", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5433/db";
    process.env.JWT_SECRET = "a".repeat(32);
    vi.resetModules();
    const { validateEnv, __resetEnvValidationForTests } = await import("@/lib/env");
    const first = validateEnv();
    delete process.env.DATABASE_URL; // would now fail if re-validated
    const second = validateEnv();
    expect(second).toBe(first);
    __resetEnvValidationForTests();
    expect(() => validateEnv()).toThrow();
  });
});
