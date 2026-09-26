import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * Phase 29 — runAiTask() unit tests. Fully mocked: no real DB, no real
 * network call to any model. `@/lib/rbac/quota` and `@/lib/ai/router` are
 * both mocked so this exercises only the gateway's own logic (routing
 * decision -> quota gate -> provider call -> JSON parse -> Zod validation
 * -> usage recording), per the task brief's "mockable/fixture-based, don't
 * require live model calls" requirement.
 */

const checkQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
vi.mock("@/lib/rbac/quota", () => ({
  checkQuota: (...args: unknown[]) => checkQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
}));

const routeAiTaskMock = vi.fn();
vi.mock("@/lib/ai/router", () => ({
  routeAiTask: (...args: unknown[]) => routeAiTaskMock(...args),
}));

const testSchema = z.object({ score: z.number().min(0).max(100) });

function makeProvider(completeImpl: (...args: unknown[]) => Promise<{ text: string; model: string; provider: string; durationMs: number }>) {
  return { name: "fake", isConfigured: () => true, complete: vi.fn(completeImpl) };
}

beforeEach(() => {
  checkQuotaMock.mockReset();
  recordUsageMock.mockReset();
  routeAiTaskMock.mockReset();
  checkQuotaMock.mockResolvedValue({ allowed: true, limit: 100, used: 0, remaining: 100, unlimited: false });
});

describe("runAiTask — happy path", () => {
  it("returns validated data and records usage against both the combined and tier-specific limit keys", async () => {
    const provider = makeProvider(async () => ({ text: JSON.stringify({ score: 88 }), model: "llama3.1:8b", provider: "fake", durationMs: 12 }));
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });

    const { runAiTask } = await import("@/lib/ai/client");
    const result = await runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema });

    expect(result.data).toEqual({ score: 88 });
    expect(result.model).toBe("llama3.1:8b");
    expect(recordUsageMock).toHaveBeenCalledWith("user-1", "max_ai_requests", 1);
    expect(recordUsageMock).toHaveBeenCalledWith("user-1", "max_llm_requests", 1);
  });

  it("strips a markdown code fence around the JSON before parsing", async () => {
    const provider = makeProvider(async () => ({
      text: "```json\n{\"score\": 42}\n```",
      model: "m",
      provider: "fake",
      durationMs: 5,
    }));
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });

    const { runAiTask } = await import("@/lib/ai/client");
    const result = await runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema });
    expect(result.data).toEqual({ score: 42 });
  });
});

describe("runAiTask — unavailable/fallback handling", () => {
  it("throws AiUnavailableError (never crashes) when the router reports no provider configured", async () => {
    routeAiTaskMock.mockReturnValue({ tier: "unavailable", reason: "No AI provider is configured." });
    const { runAiTask } = await import("@/lib/ai/client");
    const { AiUnavailableError } = await import("@/lib/ai/errors");

    await expect(
      runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema })
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("throws AiUnavailableError when the user's AI quota is exceeded, without calling the provider", async () => {
    const provider = makeProvider(async () => ({ text: "{}", model: "m", provider: "fake", durationMs: 1 }));
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });
    checkQuotaMock.mockResolvedValue({ allowed: false, limit: 10, used: 10, remaining: 0, unlimited: false, reason: "Usage limit reached (10/10)." });

    const { runAiTask } = await import("@/lib/ai/client");
    const { AiUnavailableError } = await import("@/lib/ai/errors");

    await expect(
      runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema })
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe("runAiTask — malformed AI output (untrusted input)", () => {
  it("throws AiInvalidResponseError and does NOT record usage when the model returns non-JSON text", async () => {
    const provider = makeProvider(async () => ({ text: "Sure! The page looks great overall.", model: "m", provider: "fake", durationMs: 3 }));
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });

    const { runAiTask } = await import("@/lib/ai/client");
    const { AiInvalidResponseError } = await import("@/lib/ai/errors");

    await expect(
      runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema })
    ).rejects.toBeInstanceOf(AiInvalidResponseError);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("throws AiInvalidResponseError when JSON parses but fails schema validation, and does not retry", async () => {
    const provider = makeProvider(async () => ({ text: JSON.stringify({ score: 999 }), model: "m", provider: "fake", durationMs: 3 }));
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });

    const { runAiTask } = await import("@/lib/ai/client");
    const { AiInvalidResponseError } = await import("@/lib/ai/errors");

    await expect(
      runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema, maxAttempts: 3 })
    ).rejects.toBeInstanceOf(AiInvalidResponseError);
    // Invalid-JSON/schema failures are not retried (see client.ts comment) — exactly one call.
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });
});

describe("runAiTask — transient-failure retry", () => {
  it("retries once on a thrown provider error and succeeds on the second attempt", async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls++;
      if (calls === 1) throw new Error("network blip");
      return { text: JSON.stringify({ score: 50 }), model: "m", provider: "fake", durationMs: 2 };
    });
    routeAiTaskMock.mockReturnValue({ tier: "llm", reason: "ok", provider });

    const { runAiTask } = await import("@/lib/ai/client");
    const result = await runAiTask({ taskType: "page_answerability_assessment", userId: "user-1", system: "sys", prompt: "p", schema: testSchema });
    expect(result.data).toEqual({ score: 50 });
    expect(calls).toBe(2);
  });
});
