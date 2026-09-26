/**
 * Phase 29 — Local AI (Ollama) provider. The documented default per the
 * master doc's "Local / Optional External Model" framing: zero mandatory
 * paid APIs, local-first. `OLLAMA_MODEL` must be explicitly set for this
 * provider to report itself as configured — this codebase never assumes a
 * particular model is pulled (that would silently default into behavior the
 * operator didn't ask for, the same trap Section 79 warns against for
 * fabricated data). `OLLAMA_BASE_URL` defaults to Ollama's own documented
 * default port when unset, since that's just "where to look", not "what to
 * assume is there".
 */

import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "../types";
import { AiProviderError, AiTimeoutError } from "../errors";

const DEFAULT_BASE_URL = "http://localhost:11434";

interface OllamaGenerateResponse {
  response?: string;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements AiProvider {
  readonly name = "ollama";

  private get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL;
  }

  private get model(): string | null {
    const m = process.env.OLLAMA_MODEL?.trim();
    return m ? m : null;
  }

  isConfigured(): boolean {
    return this.model !== null;
  }

  async complete(req: AiCompletionRequest, opts?: { timeoutMs?: number }): Promise<AiCompletionResult> {
    const model = this.model;
    if (!model) {
      throw new AiProviderError("Ollama provider called without OLLAMA_MODEL configured.");
    }

    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt: req.prompt,
          system: req.system,
          stream: false,
          ...(req.jsonMode ? { format: "json" } : {}),
          options: {
            temperature: req.temperature ?? 0.2,
          },
        }),
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new AiProviderError(`Ollama returned HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
      }

      const body = (await res.json()) as OllamaGenerateResponse;
      if (body.error) {
        throw new AiProviderError(`Ollama error: ${body.error}`);
      }

      return {
        text: body.response ?? "",
        model: body.model ?? model,
        provider: this.name,
        promptTokens: body.prompt_eval_count,
        completionTokens: body.eval_count,
        totalTokens:
          body.prompt_eval_count !== undefined && body.eval_count !== undefined
            ? body.prompt_eval_count + body.eval_count
            : undefined,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AiTimeoutError(`Ollama request to ${this.baseUrl} timed out after ${timeoutMs}ms.`);
      }
      throw new AiProviderError(
        `Failed to reach Ollama at ${this.baseUrl}. Is it running (\`ollama serve\`)? ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
