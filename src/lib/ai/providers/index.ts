/**
 * Phase 29 — provider registry / selection. `AI_PROVIDER` picks which
 * provider backs the gateway (defaults to "ollama", the documented
 * local-first default). Any future hosted provider must be opted into
 * explicitly the same way — never silently substituted when the default is
 * unconfigured, per the "zero mandatory paid APIs" constraint.
 */

import type { AiProvider } from "../types";
import { OllamaProvider } from "./ollama";

const providers: Record<string, () => AiProvider> = {
  ollama: () => new OllamaProvider(),
};

/** Returns the configured provider, or `null` if none is configured (caller must handle this as "AI unavailable", never crash). */
export function getConfiguredProvider(): AiProvider | null {
  const key = (process.env.AI_PROVIDER?.trim() || "ollama").toLowerCase();
  const factory = providers[key];
  if (!factory) return null;
  const provider = factory();
  return provider.isConfigured() ? provider : null;
}
