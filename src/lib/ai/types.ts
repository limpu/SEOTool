/**
 * Phase 29 — LLM/SLM/Local AI Integration. Provider-agnostic contract every
 * AI backend implements. Modeled after the master doc's LLM Plan: AI Task ->
 * AI Task Router -> Model Policy -> LLM Gateway -> Local/Optional External
 * Model. This file defines the "gateway" boundary — nothing above this layer
 * (route handlers, services) should ever import a provider-specific SDK or
 * hardcode an HTTP call; everything goes through `AiProvider`.
 */

export interface AiCompletionRequest {
  /** System / instruction prompt. */
  system?: string;
  /** User-turn prompt (already rendered from a template — see prompts.ts). */
  prompt: string;
  /** 0-1, lower = more deterministic. Defaults are provider-specific. */
  temperature?: number;
  /** Ask the provider to constrain output to valid JSON, where supported. */
  jsonMode?: boolean;
}

export interface AiCompletionResult {
  /** Raw text returned by the model — callers must validate/parse this themselves (untrusted input). */
  text: string;
  model: string;
  provider: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Wall-clock duration of the call, for observability. */
  durationMs: number;
}

export interface AiProvider {
  readonly name: string;
  /** Whether this provider has enough configuration (env vars, etc.) to attempt a call. Never assumes a default model. */
  isConfigured(): boolean;
  complete(req: AiCompletionRequest, opts?: { timeoutMs?: number }): Promise<AiCompletionResult>;
}

/** The two task tiers named in the master doc's SLM Plan, plus the tasks this phase does not (yet) route anywhere. */
export type AiModelTier = "deterministic" | "slm" | "llm" | "unavailable";

export type AiTaskType = "page_answerability_assessment" | "content_gap_analysis";

export interface AiRouteDecision {
  tier: AiModelTier;
  /** Human-readable reasoning, surfaced in logs/errors — never silently picks a tier. */
  reason: string;
  provider?: AiProvider;
}
