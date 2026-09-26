import { describe, expect, it, vi, afterEach } from "vitest";

// Phase 34 (Production Readiness): the health-check route itself is a thin
// wrapper around `db.execute(sql\`SELECT 1\`)` — mocking the DB module lets
// this test prove the response-shape contract (200/"ok" vs 503/"error")
// deterministically, without needing a real Postgres connection, mirroring
// this codebase's existing `ai-client.test.ts` fully-mocked-dependency style.
describe("GET /api/health", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
  });

  it("returns 200 with status ok when the database responds", async () => {
    vi.doMock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } }));
    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
    expect(typeof body.responseTimeMs).toBe("number");
  });

  it("returns 503 with status error when the database is unreachable, without leaking error detail", async () => {
    vi.doMock("@/lib/db", () => ({
      db: { execute: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5433")) },
    }));
    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.checks.database).toBe("error");
    // The raw error message (which can contain host/port info) must never
    // be forwarded to a public, unauthenticated endpoint's response body.
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED/);
    expect(JSON.stringify(body)).not.toMatch(/5433/);
  });
});
