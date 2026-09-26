/**
 * Phase 29 — AI Task Router (master doc: AI Task -> AI Task Router -> Model
 * Policy -> LLM Gateway -> Local/Optional External Model).
 *
 * Routing policy, per the master doc's SLM Plan diagram (deterministic rules
 * first -> SLM if reliable -> LLM): this phase only implements two task
 * types, and both genuinely require open-ended semantic judgment over free
 * text (assessing whether prose answers a question; comparing two pages'
 * topical coverage) — neither is a classification/intent/entity-tagging
 * task an SLM could handle reliably, so both route straight to the "llm"
 * tier. `SLM_ELIGIBLE_TASKS` is kept as an explicit, empty-today registry so
 * a future task (e.g. simple content-type classification) has a documented
 * place to opt into the cheaper tier rather than defaulting every task to
 * the biggest model available.
 */

import type { AiModelTier, AiRouteDecision, AiTaskType } from "./types";
import { getConfiguredProvider } from "./providers";

/** Task types that are simple/closed-set enough an SLM could reliably handle them. Empty in this phase — see file comment. */
const SLM_ELIGIBLE_TASKS = new Set<AiTaskType>([]);

export function routeAiTask(taskType: AiTaskType): AiRouteDecision {
  const provider = getConfiguredProvider();

  if (!provider) {
    return {
      tier: "unavailable",
      reason: "No AI provider is configured (set OLLAMA_MODEL / OLLAMA_BASE_URL). AI analysis is not available in this environment.",
    };
  }

  const tier: AiModelTier = SLM_ELIGIBLE_TASKS.has(taskType) ? "slm" : "llm";
  return {
    tier,
    reason:
      tier === "slm"
        ? `Task "${taskType}" is a closed-set classification task, routed to the SLM tier.`
        : `Task "${taskType}" requires open-ended semantic judgment, routed to the LLM tier.`,
    provider,
  };
}
