import type { CheckResult, EnvVarReport } from "../types";

/**
 * Web Installer — integration CONFIGURATION VALIDITY (Stage 1 scope).
 *
 * ─── WHAT THIS FILE DELIBERATELY DOES NOT DO ────────────────────────────
 * It does not start an OAuth handshake, send a test email, or call a model.
 * Those are real side effects — an OAuth flow needs interactive browser
 * consent, a test email actually lands in someone's inbox, an Ollama call
 * loads a model into memory — and Stage 1 is a READ-ONLY detection engine.
 * They are Stage 2 actions and are named as such in the results, so an
 * operator is never left believing something was tested when it was not.
 *
 * The distinction is the point. "Shape is correct" and "it works" are
 * different claims, and this engine only ever makes the first one. A
 * structurally perfect Google configuration still fails if the consent
 * screen is in Testing mode; perfectly-formed SMTP credentials still fail if
 * the provider requires an app password. Reporting shape as proof of
 * function would be fabricating a result (Section 77), so these checks top
 * out at `configured`, never `verified`.
 */

export interface IntegrationFacts {
  reports: EnvVarReport[];
  env: NodeJS.ProcessEnv;
  isProduction: boolean;
}

function reportFor(reports: EnvVarReport[], name: string): EnvVarReport | undefined {
  return reports.find((r) => r.name === name);
}

function anyInvalid(reports: EnvVarReport[], names: string[]): EnvVarReport[] {
  return names
    .map((n) => reportFor(reports, n))
    .filter((r): r is EnvVarReport => !!r && (r.classification === "invalid" || r.classification === "missing"));
}

function allUnset(reports: EnvVarReport[], names: string[]): boolean {
  return names.every((n) => reportFor(reports, n)?.classification === "optional");
}

export function evaluateGoogleIntegration(facts: IntegrationFacts): CheckResult {
  const names = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "GOOGLE_GA4_OAUTH_REDIRECT_URI",
    "GSC_TOKEN_ENCRYPTION_KEY",
    "GA4_TOKEN_ENCRYPTION_KEY",
  ];
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "integration.google",
    group: "integrations",
    label: "Google Search Console & Analytics (configuration)",
    blocking: false,
  };

  if (allUnset(facts.reports, names)) {
    return {
      ...base,
      status: "optional",
      summary: "Google Search Console and Analytics are not configured.",
      detail:
        "This is a fully supported state: both features report themselves as not configured in the UI rather than failing. Everything else — crawling, the rule engines, PageSpeed, reporting — works without them.",
      howToFix: [
        "To enable them later: create an OAuth client in Google Cloud Console, set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, both redirect URIs, and a separate 32-byte encryption key for each integration.",
      ],
    };
  }

  const problems = anyInvalid(facts.reports, names);
  if (problems.length > 0) {
    return {
      ...base,
      status: "fail",
      summary: `Google integration is partially or incorrectly configured: ${problems.map((p) => p.name).join(", ")}.`,
      detail: problems.map((p) => p.reason).join(" "),
      howToFix: [
        ...problems.flatMap((p) => p.howToFix ?? []),
        "Both redirect URIs must be registered in the Google Cloud Console EXACTLY as written here — Google does exact string matching.",
        "Configuration shape is all that is checked here. Whether the credentials actually work is verified in the connect step, not now.",
      ],
    };
  }

  const productionCaveat = facts.isProduction
    ? " Note: while the OAuth consent screen is in 'Testing' mode Google expires refresh tokens after 7 days, for every user, unconditionally — publish the consent screen before onboarding real clients. Both scopes used here (webmasters.readonly, analytics.readonly) are classified as sensitive, so Google's verification review has real lead time and should be started early."
    : "";

  return {
    ...base,
    status: "pass",
    summary: "Google credentials are present and structurally valid.",
    detail:
      "Client ID shape, both redirect URI paths, and both 32-byte encryption keys check out. This is CONFIGURATION VALIDITY ONLY — no OAuth handshake was attempted, so this is not proof that the credentials work." +
      productionCaveat,
  };
}

export function evaluateSmtpIntegration(facts: IntegrationFacts): CheckResult {
  const names = ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM"];
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "integration.smtp",
    group: "integrations",
    label: "Email delivery (SMTP configuration)",
    blocking: facts.isProduction,
  };

  const userSet = !!facts.env.EMAIL_USER?.trim();
  const passSet = !!facts.env.EMAIL_PASS?.trim();
  const hostSet = !!facts.env.EMAIL_HOST?.trim();

  if (!hostSet && !userSet && !passSet) {
    if (facts.isProduction) {
      return {
        ...base,
        status: "fail",
        summary: "SMTP is not configured, and this is a production deployment.",
        detail:
          "Without SMTP credentials, registration verification codes and password-reset emails are written to the server console instead of being sent. In production that means NOBODY CAN COMPLETE REGISTRATION and nobody can reset a password — the accounts exist but their owners never receive the code.",
        howToFix: [
          "Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS and EMAIL_FROM for a real SMTP provider.",
          "Port 587 with EMAIL_SECURE=false (STARTTLS) suits most providers; port 465 needs EMAIL_SECURE=true.",
          "Gmail and several other providers require an app-specific password, not the account password.",
          "Restart after setting these, then re-run these checks.",
        ],
      };
    }
    return {
      ...base,
      status: "optional",
      summary: "SMTP is not configured — verification codes are logged to the server console instead.",
      detail:
        "A supported development state: OTPs appear in the server log so registration can be completed locally. It is NOT usable in production, and this check becomes a failure once NODE_ENV is production.",
      howToFix: [
        "Before going live, set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS and EMAIL_FROM.",
      ],
    };
  }

  // Host set but no credentials. `src/lib/email/index.ts` only takes the
  // "really send it" path when NODE_ENV is production OR EMAIL_USER is set,
  // so outside production this configuration still logs OTPs to the console.
  // Calling it "present and structurally valid" would tell the operator mail
  // works when nothing is being sent — the exact overclaim Section 77 forbids.
  if (!facts.isProduction && hostSet && !userSet) {
    return {
      ...base,
      status: "optional",
      summary:
        "An SMTP host is set but no credentials are — verification codes are still being logged to the server console, not emailed.",
      detail:
        "The email layer only attempts real delivery when NODE_ENV is production or EMAIL_USER is set. Neither is true here, so nothing is being sent. This is a supported development state, and it is reported as unconfigured rather than as working, because no mail is leaving this server.",
      howToFix: [
        "Set EMAIL_USER and EMAIL_PASS to authenticate against the configured host, then restart.",
        "This becomes a hard failure once NODE_ENV is production — without it nobody can complete registration or reset a password.",
      ],
    };
  }

  const problems = anyInvalid(facts.reports, names);
  if (problems.length > 0) {
    return {
      ...base,
      status: "fail",
      summary: `SMTP is partially configured: ${problems.map((p) => p.name).join(", ")}.`,
      detail:
        problems.map((p) => p.reason).join(" ") +
        " A half-configured SMTP setup is worse than none: the code takes the 'send for real' path as soon as EMAIL_USER is set, so mail is attempted and fails rather than falling back to the console.",
      howToFix: [
        ...problems.flatMap((p) => p.howToFix ?? []),
        "Set the whole group together, or unset EMAIL_USER entirely to fall back cleanly to console logging in development.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: "SMTP settings are present and structurally valid.",
    detail:
      "Host, port, credentials and From address are all set and well-formed. CONFIGURATION VALIDITY ONLY — no test message was sent, so this is not proof that mail is deliverable. Sending a test email is a Stage 2 action.",
  };
}

export function evaluateOllamaIntegration(facts: IntegrationFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "integration.ollama",
    group: "integrations",
    label: "Local AI (Ollama configuration)",
    blocking: false,
  };

  const model = facts.env.OLLAMA_MODEL?.trim();
  const baseUrl = facts.env.OLLAMA_BASE_URL?.trim();

  if (!model) {
    return {
      ...base,
      status: "optional",
      summary: "OLLAMA_MODEL is not set — AI-assisted analysis is disabled.",
      detail:
        "There is deliberately no default model: guessing one would mean silently analysing with a model nobody chose. With this unset, the AI router reports 'no AI provider is configured' and every deterministic engine continues to work untouched — AI only ever explains and prioritises, it never produces a measurement.",
      howToFix: [
        "To enable it: install Ollama, pull a model (`ollama pull llama3.2`), and set OLLAMA_MODEL to that model's exact tag.",
        "Set OLLAMA_BASE_URL if Ollama is not at http://localhost:11434 — from inside a container, localhost is the container itself, not the host.",
      ],
    };
  }

  const problems = anyInvalid(facts.reports, ["OLLAMA_BASE_URL", "AI_PROVIDER"]);
  if (problems.length > 0) {
    return {
      ...base,
      status: "fail",
      summary: `Ollama configuration is invalid: ${problems.map((p) => p.name).join(", ")}.`,
      detail: problems.map((p) => p.reason).join(" "),
      howToFix: problems.flatMap((p) => p.howToFix ?? []),
    };
  }

  const containerNote =
    " If this application runs in a container and Ollama runs on the host, `localhost` will not reach it — use `host.docker.internal` or the host's network address.";

  return {
    ...base,
    status: "pass",
    summary: `Ollama is configured for model '${model}' at ${baseUrl || "http://localhost:11434 (default)"}.`,
    detail:
      "CONFIGURATION VALIDITY ONLY — no request was made to Ollama, so this does not confirm the server is running or that the model is actually pulled. Calling the model is a Stage 2 action." +
      containerNote,
  };
}
