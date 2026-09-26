import { getConfiguredProvider } from "@/lib/ai/providers";
import { sanitizeForDisplay } from "../redact";

/**
 * Web Installer — Stage 2. The Ollama test.
 *
 * ─── OPTIONAL MEANS OPTIONAL ────────────────────────────────────────────
 * Every outcome of this test is non-blocking. AI is an optional layer in this
 * product (the master doc's "zero mandatory paid APIs / local-first" framing);
 * the crawler, every deterministic rule engine, Search Console, Analytics,
 * PageSpeed and all reporting work with no model at all. A failure here must
 * therefore never prevent the installation from completing, and the wording
 * says what actually stops working rather than implying the platform is
 * broken.
 *
 * ─── THREE SEPARATE FACTS, REPORTED SEPARATELY ──────────────────────────
 * Stage 1's `integration.ollama` check only reads configuration and says so.
 * This test measures three genuinely different things, because they fail
 * independently and have different fixes:
 *
 *   1. REACHABILITY — is anything answering at `OLLAMA_BASE_URL`?
 *   2. MODEL AVAILABILITY — is `OLLAMA_MODEL` actually pulled? A host that is
 *      up with the model absent is the single most common failure, and it is
 *      indistinguishable from "working" if you only check reachability.
 *   3. A REAL COMPLETION — a tiny generation through the application's own
 *      `AiProvider`. This is what proves the model can be loaded and run on
 *      this hardware; a model can be present and still fail to load for want
 *      of memory.
 *
 * The completion goes through `getConfiguredProvider()` from
 * `src/lib/ai/providers` — the same gateway every AI feature uses. Testing a
 * hand-rolled HTTP call would prove something about the test, not about the
 * product.
 */

const DEFAULT_BASE_URL = "http://localhost:11434";

export interface OllamaTestOutcome {
  ok: boolean;
  cause:
    | "ok"
    | "not_configured"
    | "unreachable"
    | "model_missing"
    | "completion_failed"
    | "unknown";
  message: string;
  howToFix: string[];
  /** Always false — this test can never block an installation. */
  blocking: false;
  details: {
    baseUrl: string;
    model: string | null;
    reachable: boolean | null;
    modelAvailable: boolean | null;
    /** Model names the host reports. Truncated — a host can have dozens. */
    availableModels?: string[];
    completionOk: boolean | null;
    /** The model's actual reply, capped. Proof it ran, not a fabricated tick. */
    sample?: string;
    durationMs?: number;
  };
}

function baseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/** Ask the host which models it has. Never throws. */
export async function listOllamaModels(
  url: string,
  timeoutMs = 5000,
  fetchImpl: typeof fetch = fetch
): Promise<{ reachable: boolean; models: string[]; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { reachable: true, models: [], error: `The host answered with HTTP ${res.status}.` };
    }
    const body = (await res.json()) as { models?: { name?: string }[] };
    return {
      reachable: true,
      models: (body.models ?? []).map((m) => m.name ?? "").filter(Boolean),
    };
  } catch (err) {
    return {
      reachable: false,
      models: [],
      error: sanitizeForDisplay(err instanceof Error ? err.message : String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ollama's tag list reports models with an explicit tag (`llama3.2:latest`).
 * An operator who set `OLLAMA_MODEL=llama3.2` has a correct configuration —
 * Ollama itself resolves the bare name to `:latest` — so a naive exact match
 * would report a working setup as broken.
 */
export function modelIsAvailable(configured: string, available: string[]): boolean {
  const want = configured.trim();
  if (!want) return false;
  const wantWithTag = want.includes(":") ? want : `${want}:latest`;
  return available.some((m) => m === want || m === wantWithTag);
}

export async function testOllama(): Promise<OllamaTestOutcome> {
  const url = baseUrl();
  const model = process.env.OLLAMA_MODEL?.trim() || null;

  if (!model) {
    return {
      ok: false,
      cause: "not_configured",
      blocking: false,
      message:
        "OLLAMA_MODEL is not set, so no model is configured and there is nothing to test. This is a supported state, not a failure.",
      howToFix: [
        "Leave it unset to install without AI. Every AI-assisted feature will report itself as 'AI not configured' rather than failing, and nothing else is affected.",
        "To enable AI: install Ollama, run `ollama pull llama3.2` (or another model), set OLLAMA_MODEL to the exact name you pulled, and restart the application.",
      ],
      details: { baseUrl: url, model: null, reachable: null, modelAvailable: null, completionOk: null },
    };
  }

  const tags = await listOllamaModels(url);
  if (!tags.reachable) {
    return {
      ok: false,
      cause: "unreachable",
      blocking: false,
      message: `Nothing answered at ${url}. Ollama is either not running or not reachable from this server.`,
      howToFix: [
        "Start Ollama on the host: `ollama serve`.",
        "If Ollama runs on a different machine or in another container, set OLLAMA_BASE_URL to an address this application can reach — `localhost` inside a container refers to the container itself, not to the host.",
        "From a Docker container reaching the host, `http://host.docker.internal:11434` usually works on Docker Desktop; on Linux use the host's LAN address.",
        "Installation can continue without this — AI features simply report themselves as unavailable.",
      ],
      details: {
        baseUrl: url,
        model,
        reachable: false,
        modelAvailable: null,
        completionOk: null,
        sample: tags.error,
      },
    };
  }

  if (!modelIsAvailable(model, tags.models)) {
    return {
      ok: false,
      cause: "model_missing",
      blocking: false,
      message: `Ollama is running at ${url}, but the configured model "${model}" is not among the ${tags.models.length} model(s) it has.`,
      howToFix: [
        `Pull it: \`ollama pull ${model}\`.`,
        "Or change OLLAMA_MODEL to one of the models listed below and restart the application.",
        "A running Ollama with the wrong model looks healthy until the first AI request fails, which is why this is checked separately from reachability.",
      ],
      details: {
        baseUrl: url,
        model,
        reachable: true,
        modelAvailable: false,
        availableModels: tags.models.slice(0, 20),
        completionOk: null,
      },
    };
  }

  const provider = getConfiguredProvider();
  if (!provider) {
    return {
      ok: false,
      cause: "not_configured",
      blocking: false,
      message:
        "The model is present, but the AI gateway reports no configured provider — AI_PROVIDER names a provider this build does not have.",
      howToFix: [
        "Unset AI_PROVIDER to use the default local provider (ollama), or set it to `ollama`.",
      ],
      details: {
        baseUrl: url,
        model,
        reachable: true,
        modelAvailable: true,
        availableModels: tags.models.slice(0, 20),
        completionOk: null,
      },
    };
  }

  const started = Date.now();
  try {
    const result = await provider.complete(
      {
        system: "You are a connectivity test. Answer with a single word.",
        prompt: "Reply with exactly the word: ok",
        temperature: 0,
      },
      // Generous, because the first request after a pull loads the model into
      // memory and that can genuinely take a while on modest hardware.
      { timeoutMs: 60_000 }
    );
    const sample = result.text.trim().slice(0, 120);
    return {
      ok: true,
      cause: "ok",
      blocking: false,
      message: `${result.model} responded in ${Date.now() - started} ms. AI features are available.`,
      howToFix: [],
      details: {
        baseUrl: url,
        model,
        reachable: true,
        modelAvailable: true,
        availableModels: tags.models.slice(0, 20),
        completionOk: true,
        sample: sample || "(the model returned an empty response)",
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    return {
      ok: false,
      cause: "completion_failed",
      blocking: false,
      message: `Ollama is running and "${model}" is present, but the test generation failed. The model is installed but could not actually produce a response.`,
      howToFix: [
        "The usual cause is memory: loading a model needs several gigabytes of free RAM, and the load fails rather than degrading.",
        `Try it directly on the host to see the raw error: \`ollama run ${model} "say ok"\`.`,
        "A smaller model (for example `llama3.2:1b`) will run where a larger one cannot.",
        "Installation can continue without this — AI features simply report themselves as unavailable.",
      ],
      details: {
        baseUrl: url,
        model,
        reachable: true,
        modelAvailable: true,
        availableModels: tags.models.slice(0, 20),
        completionOk: false,
        sample: sanitizeForDisplay(err instanceof Error ? err.message : String(err)),
        durationMs: Date.now() - started,
      },
    };
  }
}
