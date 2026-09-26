import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("routeAiTask", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("routes to 'unavailable' when no provider is configured (OLLAMA_MODEL unset)", async () => {
    delete process.env.OLLAMA_MODEL;
    process.env.AI_PROVIDER = "ollama";
    vi.resetModules();
    const { routeAiTask } = await import("@/lib/ai/router");
    const decision = routeAiTask("page_answerability_assessment");
    expect(decision.tier).toBe("unavailable");
    expect(decision.provider).toBeUndefined();
    expect(decision.reason).toMatch(/no ai provider is configured/i);
  });

  it("routes to the 'llm' tier when a provider is configured", async () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "llama3.1:8b";
    vi.resetModules();
    const { routeAiTask } = await import("@/lib/ai/router");
    const decision = routeAiTask("page_answerability_assessment");
    expect(decision.tier).toBe("llm");
    expect(decision.provider).toBeDefined();
    expect(decision.provider?.name).toBe("ollama");
  });

  it("routes to 'llm' for content_gap_analysis too (no SLM-eligible tasks defined in this phase)", async () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "llama3.1:8b";
    vi.resetModules();
    const { routeAiTask } = await import("@/lib/ai/router");
    const decision = routeAiTask("content_gap_analysis");
    expect(decision.tier).toBe("llm");
  });

  it("routes to 'unavailable' for an unknown/unconfigured AI_PROVIDER value", async () => {
    process.env.AI_PROVIDER = "some-unsupported-provider";
    process.env.OLLAMA_MODEL = "llama3.1:8b";
    vi.resetModules();
    const { routeAiTask } = await import("@/lib/ai/router");
    const decision = routeAiTask("page_answerability_assessment");
    expect(decision.tier).toBe("unavailable");
  });
});

describe("OllamaProvider.isConfigured", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is false when OLLAMA_MODEL is unset", async () => {
    delete process.env.OLLAMA_MODEL;
    const { OllamaProvider } = await import("@/lib/ai/providers/ollama");
    expect(new OllamaProvider().isConfigured()).toBe(false);
  });

  it("is true when OLLAMA_MODEL is set to a non-empty string", async () => {
    process.env.OLLAMA_MODEL = "llama3.1:8b";
    const { OllamaProvider } = await import("@/lib/ai/providers/ollama");
    expect(new OllamaProvider().isConfigured()).toBe(true);
  });

  it("is false when OLLAMA_MODEL is set but blank/whitespace-only", async () => {
    process.env.OLLAMA_MODEL = "   ";
    const { OllamaProvider } = await import("@/lib/ai/providers/ollama");
    expect(new OllamaProvider().isConfigured()).toBe(false);
  });
});
