/**
 * Phase 29 — typed error hierarchy so every AI-touching route can degrade
 * gracefully (Section 79: an AI feature must report "unavailable", never
 * crash the request or fabricate a result).
 */

export class AiUnavailableError extends Error {
  constructor(message = "AI analysis unavailable — no AI provider is configured.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiTimeoutError extends Error {
  constructor(message = "AI request timed out.") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** The model responded, but its output did not parse as valid JSON or failed Zod validation. AI output is untrusted input. */
export class AiInvalidResponseError extends Error {
  constructor(
    message: string,
    public readonly raw: string
  ) {
    super(message);
    this.name = "AiInvalidResponseError";
  }
}
