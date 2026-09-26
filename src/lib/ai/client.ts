/**
 * Phase 29 — LLM Gateway. The single choke point every AI-touching feature
 * calls through: task routing, timeout, one retry on transient failure,
 * structured-output Zod validation, and Phase 17 usage-quota recording
 * (`max_ai_requests` + `max_llm_requests`/`max_slm_requests`, the limit keys
 * `limit-catalog.ts` already seeded back in Phase 17 anticipating this
 * phase). Never overwrites deterministic data — callers persist the
 * returned value into `ai_page_assessments`/`ai_content_gap_analyses` only.
 */

import { z } from "zod";
import type { AiTaskType } from "./types";
import { routeAiTask } from "./router";
import { AiInvalidResponseError, AiUnavailableError, AiProviderError, AiTimeoutError } from "./errors";
import { recordUsage } from "@/lib/rbac/quota";
import { checkQuota } from "@/lib/rbac/quota";

export interface RunAiTaskInput<T> {
  taskType: AiTaskType;
  userId: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  /** How many attempts total (including the first), on timeout/network errors only — never retried on invalid-JSON, since that's a model-quality problem, not a transient one. */
  maxAttempts?: number;
}

export interface RunAiTaskResult<T> {
  data: T;
  model: string;
  provider: string;
  raw: string;
  durationMs: number;
}

/**
 * Quota check only (no throw) — callers that want to pre-flight a quota
 * check before doing expensive prep work (e.g. live-fetching page content)
 * can call this first.
 */
export async function checkAiQuota(userId: string) {
  const combined = await checkQuota(userId, "max_ai_requests");
  const llm = await checkQuota(userId, "max_llm_requests");
  return { combined, llm };
}

export async function runAiTask<T>(input: RunAiTaskInput<T>): Promise<RunAiTaskResult<T>> {
  const decision = routeAiTask(input.taskType);
  if (decision.tier === "unavailable" || !decision.provider) {
    throw new AiUnavailableError(decision.reason);
  }

  const combinedQuota = await checkQuota(input.userId, "max_ai_requests");
  if (!combinedQuota.allowed) {
    throw new AiUnavailableError(combinedQuota.reason ?? "AI request quota exceeded.");
  }
  const tierLimitKey = decision.tier === "slm" ? "max_slm_requests" : "max_llm_requests";
  const tierQuota = await checkQuota(input.userId, tierLimitKey);
  if (!tierQuota.allowed) {
    throw new AiUnavailableError(tierQuota.reason ?? "AI request quota exceeded.");
  }

  const maxAttempts = input.maxAttempts ?? 2;
  const timeoutMs = input.timeoutMs ?? 45_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const completion = await decision.provider.complete(
        { system: input.system, prompt: input.prompt, jsonMode: true, temperature: 0.2 },
        { timeoutMs }
      );

      const parsed = parseJsonLoose(completion.text);
      const validated = input.schema.safeParse(parsed);
      if (!validated.success) {
        throw new AiInvalidResponseError(
          `AI response failed schema validation: ${validated.error.issues.map((i) => i.message).join("; ")}`,
          completion.text
        );
      }

      // Usage recording happens only on a successful, validated response —
      // a call that errored or returned garbage did not deliver value, so
      // it is not charged against the user's quota.
      await recordUsage(input.userId, "max_ai_requests", 1);
      await recordUsage(input.userId, tierLimitKey, 1);

      return {
        data: validated.data,
        model: completion.model,
        provider: completion.provider,
        raw: completion.text,
        durationMs: completion.durationMs,
      };
    } catch (err) {
      lastError = err;
      // Invalid-JSON / schema-validation failures are not retried — a
      // second call with the identical prompt is unlikely to fix a model
      // that produced malformed output. Timeouts/network errors ARE
      // retried once, since those are plausibly transient.
      if (err instanceof AiInvalidResponseError) break;
      if (attempt >= maxAttempts) break;
    }
  }

  if (lastError instanceof AiInvalidResponseError) throw lastError;
  if (lastError instanceof AiTimeoutError) throw lastError;
  if (lastError instanceof AiProviderError) throw lastError;
  throw new AiProviderError(lastError instanceof Error ? lastError.message : String(lastError), lastError);
}

/** Ollama's `format: "json"` should already return raw JSON, but some models still wrap it in a code fence — strip that defensively before parsing. */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new AiInvalidResponseError("AI response was not valid JSON.", text);
  }
}
