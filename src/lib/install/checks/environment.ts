import type { CheckResult, EnvClassification, EnvVarReport } from "../types";
import { isLocalHost } from "./network";

/**
 * Web Installer — environment-variable classification.
 *
 * ─── PRESENCE IS NOT VALIDITY ───────────────────────────────────────────
 * The whole reason this file is not a `Object.keys(process.env)` loop is
 * that "the variable is set" answers almost nothing. The failures that
 * actually happen in this codebase are all set-but-wrong:
 *
 *   - `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/gsc/callback` is
 *     present, non-empty, correctly formatted — and completely broken in
 *     production, because Google matches redirect URIs by exact string and
 *     will reject it with `redirect_uri_mismatch`;
 *   - `GSC_TOKEN_ENCRYPTION_KEY` is present but decodes to 24 bytes instead
 *     of 32, so AES-256-GCM throws on the first token it tries to store;
 *   - `NODE_ENV=development` on a public server is present and valid and
 *     disables the Secure cookie flag;
 *   - `JWT_SECRET=changeme` is present and 8 characters long.
 *
 * So each variable gets a real validator, and the classification is
 * `missing | invalid | configured | verified | optional`, where:
 *   configured — set and structurally valid, but NOT proven to work;
 *   verified   — set AND independently proven to work during this run
 *                (only `DATABASE_URL` and `PAGESPEED_CHROME_PATH` can earn
 *                this in Stage 1, from the database probe and the Chromium
 *                execution check respectively).
 * Stage 1 deliberately does not promote SMTP or Google credentials to
 * `verified` — that would require sending mail and running an OAuth
 * handshake, which are Stage 2 actions. Claiming `verified` from shape
 * alone would be exactly the kind of unearned confidence Section 77
 * prohibits.
 *
 * ─── THE LIST IS DERIVED FROM CODE, NOT FROM DOCS ───────────────────────
 * Every entry below was found by searching `process.env.` across `src/`.
 * That is why `PAGESPEED_CHROME_PATH` is here (used by
 * `src/lib/pagespeed/lighthouse-runner.ts`) even though it appears in no
 * `.env` file in this repo, and why nothing appears here that the code does
 * not actually read.
 */

export type EnvRequirement =
  /** The app cannot start without it (matches src/lib/env.ts). */
  | "required"
  /** Required for a correct production deployment, not for local dev. */
  | "required-in-production"
  /** Optional feature; unset is a supported, honest state. */
  | "feature"
  /** Optional tuning knob with a working default. */
  | "tuning";

export interface EnvVarSpec {
  name: string;
  requirement: EnvRequirement;
  secret: boolean;
  feature: string;
  /** Which other variables must be set for this one to be meaningful. */
  groupWith?: string[];
  validate?: (value: string, ctx: EnvEvalContext) => { ok: boolean; reason?: string; fix?: string[] };
}

export interface EnvEvalContext {
  isProduction: boolean;
  env: NodeJS.ProcessEnv;
}

function ok() {
  return { ok: true as const };
}
function bad(reason: string, fix?: string[]) {
  return { ok: false as const, reason, fix };
}

function validateRedirectUri(name: string, expectedPath: string) {
  return (value: string, ctx: EnvEvalContext) => {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return bad(`${name} is not a valid absolute URL.`, [
        `Set ${name} to a full URL ending in ${expectedPath}, e.g. https://seo.example.com${expectedPath}`,
      ]);
    }
    if (!url.pathname.endsWith(expectedPath)) {
      return bad(
        `${name} does not end in ${expectedPath}, so Google will redirect users to a route that does not handle the callback.`,
        [
          `Set ${name} to <your origin>${expectedPath} and register that exact string in the Google Cloud Console.`,
        ]
      );
    }
    if (ctx.isProduction && isLocalHost(url.hostname)) {
      return bad(
        `${name} points at ${url.hostname}, a development address. Google matches redirect URIs by EXACT string, so in production this fails every connect attempt with redirect_uri_mismatch.`,
        [
          `Set ${name} to https://<your-domain>${expectedPath}.`,
          "Add that exact string to the OAuth client's Authorized redirect URIs in the Google Cloud Console — Google does exact matching, not prefix or pattern matching.",
          "Restart the application afterwards, then reconnect Search Console / Analytics.",
        ]
      );
    }
    if (ctx.isProduction && url.protocol !== "https:") {
      return bad(`${name} must use https:// in production.`, [
        `Change ${name} to the https:// form and re-register it with Google.`,
      ]);
    }
    return ok();
  };
}

function validateBase64Key32(name: string) {
  return (value: string) => {
    let len = 0;
    try {
      len = Buffer.from(value.trim(), "base64").length;
    } catch {
      len = 0;
    }
    if (len !== 32) {
      return bad(
        `${name} must decode to exactly 32 bytes for AES-256-GCM; this value decodes to ${len}. Encrypted-token storage will throw on first use.`,
        [
          `Generate a correct key: \`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\``,
          `IMPORTANT: rotating ${name} makes every token already encrypted under the old key permanently undecryptable — there is no key versioning. Rotate before real client connections accumulate, not after.`,
        ]
      );
    }
    return ok();
  };
}

/**
 * The catalog. Derived from `process.env.` usages in `src/`:
 *   src/lib/env.ts, src/lib/db/index.ts, src/lib/auth/session.ts,
 *   src/lib/email/index.ts, src/lib/gsc/config.ts, src/lib/gsc/crypto.ts,
 *   src/lib/ga4/config.ts, src/lib/ga4/crypto.ts, src/lib/ai/router.ts,
 *   src/lib/ai/providers/*.ts, src/lib/pagespeed/lighthouse-runner.ts,
 *   src/app/api/auth/forgot-password/route.ts
 */
export const ENV_CATALOG: EnvVarSpec[] = [
  {
    name: "DATABASE_URL",
    requirement: "required",
    secret: true,
    feature: "Everything — this is the platform's only hard runtime dependency.",
    validate: (v) => {
      if (!/^postgres(ql)?:\/\//.test(v.trim()))
        return bad("DATABASE_URL must be a postgres:// or postgresql:// connection string.", [
          "Use the form postgresql://user:password@host:5432/database",
          "Percent-encode any @ : / # or ? characters in the password (@ becomes %40).",
        ]);
      try {
        const u = new URL(v.trim());
        if (!u.hostname) return bad("DATABASE_URL has no host.", ["Add the database host to the connection string."]);
        if (!u.pathname.replace(/^\//, ""))
          return bad("DATABASE_URL has no database name.", [
            "Append the database name: postgresql://user:pass@host:5432/<database>",
          ]);
      } catch {
        return bad("DATABASE_URL could not be parsed as a URL.", [
          "Check for unencoded special characters in the password — that is the most common cause.",
        ]);
      }
      return ok();
    },
  },
  {
    name: "JWT_SECRET",
    requirement: "required",
    secret: true,
    feature: "Session cookies AND the Google OAuth state token for both GSC and GA4.",
    validate: (v) => {
      if (v.trim().length < 32)
        return bad(
          `JWT_SECRET is ${v.trim().length} characters; at least 32 are required. Short secrets are brute-forceable and this key signs both session cookies and OAuth state.`,
          [
            `Generate one: \`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"\``,
            "Rotating JWT_SECRET invalidates every existing session AND requires re-testing both Google OAuth flows end to end, because it also signs the OAuth state parameter.",
          ]
        );
      if (/^(changeme|secret|password|test|dev|development|your[-_]?secret)/i.test(v.trim()))
        return bad("JWT_SECRET looks like a placeholder value rather than a generated secret.", [
          `Generate a real one: \`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"\``,
        ]);
      return ok();
    },
  },
  {
    name: "NODE_ENV",
    requirement: "required-in-production",
    secret: false,
    feature: "Production hardening — Secure session cookies, real email delivery, Next.js optimisations.",
    validate: (v, ctx) => {
      const val = v.trim();
      if (!["development", "production", "test"].includes(val))
        return bad(`NODE_ENV is '${val}', which is not one of development, production or test.`, [
          "Set NODE_ENV=production for a real deployment.",
        ]);
      if (ctx.isProduction && val !== "production")
        return bad("NODE_ENV is not 'production' on a deployment being treated as production.", [
          "Set NODE_ENV=production and restart.",
        ]);
      return ok();
    },
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    requirement: "required-in-production",
    secret: false,
    feature: "Password-reset links and any server-generated absolute URL.",
    validate: (v, ctx) => {
      let u: URL;
      try {
        u = new URL(v.trim());
      } catch {
        return bad("NEXT_PUBLIC_APP_URL is not a valid absolute URL.", [
          "Use the full origin including scheme, e.g. https://seo.example.com (no trailing slash).",
        ]);
      }
      if (ctx.isProduction && isLocalHost(u.hostname))
        return bad(
          `NEXT_PUBLIC_APP_URL points at ${u.hostname}, which is invalid for production — password-reset emails would link users to their own machine.`,
          [
            "Set it to the real public origin, e.g. https://seo.example.com.",
            "This value is inlined into the client bundle at BUILD time, so a rebuild is required — restarting is not enough.",
          ]
        );
      if (ctx.isProduction && u.protocol !== "https:")
        return bad("NEXT_PUBLIC_APP_URL must use https:// in production.", [
          "Change the scheme to https:// and rebuild.",
        ]);
      return ok();
    },
  },
  {
    name: "SESSION_DURATION_SECONDS",
    requirement: "tuning",
    secret: false,
    feature: "How long a login lasts. Defaults to 604800 (7 days) when unset.",
    validate: (v) => {
      const n = Number(v.trim());
      if (!Number.isFinite(n) || n <= 0)
        return bad("SESSION_DURATION_SECONDS must be a positive number of seconds.", [
          "Set it to a number, e.g. 604800 for 7 days, or remove it to use the default.",
        ]);
      return ok();
    },
  },
  {
    name: "EMAIL_HOST",
    requirement: "required-in-production",
    secret: false,
    feature: "Email delivery — registration OTPs, password resets, email-change confirmation.",
    groupWith: ["EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM"],
  },
  {
    name: "EMAIL_PORT",
    requirement: "required-in-production",
    secret: false,
    feature: "Email delivery.",
    validate: (v) => {
      const n = Number(v.trim());
      if (!Number.isInteger(n) || n < 1 || n > 65535)
        return bad("EMAIL_PORT must be a valid TCP port number.", [
          "Use 587 for STARTTLS (most common), or 465 with EMAIL_SECURE=true for implicit TLS.",
        ]);
      return ok();
    },
  },
  {
    name: "EMAIL_SECURE",
    requirement: "tuning",
    secret: false,
    feature: "Whether SMTP uses implicit TLS. Compared literally against the string 'true'.",
    validate: (v) => {
      if (!["true", "false"].includes(v.trim().toLowerCase()))
        return bad(
          `EMAIL_SECURE is '${v.trim()}'; the code compares it to the exact string 'true', so any other value means false.`,
          ["Set EMAIL_SECURE=true (port 465) or EMAIL_SECURE=false (port 587)."]
        );
      return ok();
    },
  },
  {
    name: "EMAIL_USER",
    requirement: "required-in-production",
    secret: false,
    feature: "SMTP authentication. Without it, production email is not sent at all.",
  },
  {
    name: "EMAIL_PASS",
    requirement: "required-in-production",
    secret: true,
    feature: "SMTP authentication.",
  },
  {
    name: "EMAIL_FROM",
    requirement: "tuning",
    secret: false,
    feature: "The From address on outgoing mail. Has a working default.",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    requirement: "feature",
    secret: false,
    feature: "Google Search Console and Google Analytics 4 integrations (both share this OAuth client).",
    groupWith: ["GOOGLE_CLIENT_SECRET"],
    validate: (v) => {
      if (!/\.apps\.googleusercontent\.com$/.test(v.trim()))
        return bad(
          "GOOGLE_CLIENT_ID does not have the shape of a Google OAuth client ID (it should end in .apps.googleusercontent.com).",
          ["Copy the Client ID from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs."]
        );
      return ok();
    },
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    requirement: "feature",
    secret: true,
    feature: "Google Search Console and Google Analytics 4 integrations.",
    groupWith: ["GOOGLE_CLIENT_ID"],
  },
  {
    name: "GOOGLE_OAUTH_REDIRECT_URI",
    requirement: "feature",
    secret: false,
    feature: "Google Search Console OAuth callback.",
    groupWith: ["GOOGLE_CLIENT_ID"],
    validate: validateRedirectUri("GOOGLE_OAUTH_REDIRECT_URI", "/api/gsc/callback"),
  },
  {
    name: "GOOGLE_GA4_OAUTH_REDIRECT_URI",
    requirement: "feature",
    secret: false,
    feature: "Google Analytics 4 OAuth callback (separate URI, same OAuth client).",
    groupWith: ["GOOGLE_CLIENT_ID"],
    validate: validateRedirectUri("GOOGLE_GA4_OAUTH_REDIRECT_URI", "/api/ga4/callback"),
  },
  {
    name: "GSC_TOKEN_ENCRYPTION_KEY",
    requirement: "feature",
    secret: true,
    feature: "AES-256-GCM encryption of stored Search Console refresh tokens.",
    groupWith: ["GOOGLE_CLIENT_ID"],
    validate: validateBase64Key32("GSC_TOKEN_ENCRYPTION_KEY"),
  },
  {
    name: "GA4_TOKEN_ENCRYPTION_KEY",
    requirement: "feature",
    secret: true,
    feature: "AES-256-GCM encryption of stored Analytics refresh tokens (independent from the GSC key by design).",
    groupWith: ["GOOGLE_CLIENT_ID"],
    validate: validateBase64Key32("GA4_TOKEN_ENCRYPTION_KEY"),
  },
  {
    name: "AI_PROVIDER",
    requirement: "tuning",
    secret: false,
    feature: "Which local AI provider to use. Defaults to 'ollama'.",
    validate: (v) => {
      if (v.trim().toLowerCase() !== "ollama")
        return bad(`AI_PROVIDER is '${v.trim()}', but 'ollama' is the only provider implemented.`, [
          "Set AI_PROVIDER=ollama or remove the variable to use the default.",
        ]);
      return ok();
    },
  },
  {
    name: "OLLAMA_BASE_URL",
    requirement: "feature",
    secret: false,
    feature: "Local AI analysis. Defaults to http://localhost:11434 when unset.",
    validate: (v) => {
      try {
        new URL(v.trim());
      } catch {
        return bad("OLLAMA_BASE_URL is not a valid URL.", [
          "Use the full origin, e.g. http://localhost:11434 (or the container/service address).",
        ]);
      }
      return ok();
    },
  },
  {
    name: "OLLAMA_MODEL",
    requirement: "feature",
    secret: false,
    feature: "Local AI analysis. Must be set explicitly — there is no default model, by design.",
  },
  {
    name: "PAGESPEED_CHROME_PATH",
    requirement: "feature",
    secret: false,
    feature: "PageSpeed/Lighthouse — explicit path to the Chrome/Chromium binary.",
  },
];

/**
 * Classify one variable. Pure, and the single place the
 * missing/invalid/configured/verified/optional decision is made.
 */
export function classifyEnvVar(
  spec: EnvVarSpec,
  ctx: EnvEvalContext,
  verifiedNames: ReadonlySet<string> = new Set()
): EnvVarReport {
  const raw = ctx.env[spec.name];
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    // A feature variable is only "missing" if the rest of its group is
    // configured — an entirely unconfigured optional feature is `optional`,
    // which is a legitimate supported state, not a defect.
    const groupPartiallySet = (spec.groupWith ?? []).some((n) => !!ctx.env[n]?.trim());

    if (spec.requirement === "required") {
      return {
        name: spec.name,
        classification: "missing",
        reason: `${spec.name} is not set. The application cannot start without it.`,
        feature: spec.feature,
        secret: spec.secret,
        howToFix: [`Set ${spec.name} in the environment and restart the application.`],
      };
    }
    if (spec.requirement === "required-in-production" && ctx.isProduction) {
      return {
        name: spec.name,
        classification: "missing",
        reason: `${spec.name} is not set, and this is a production deployment.`,
        feature: spec.feature,
        secret: spec.secret,
        howToFix: [`Set ${spec.name} before serving real users. Affects: ${spec.feature}`],
      };
    }
    if (spec.requirement === "feature" && groupPartiallySet) {
      return {
        name: spec.name,
        classification: "missing",
        reason: `${spec.name} is not set, but other variables in the same feature group are — the feature is half-configured and will fail at run time.`,
        feature: spec.feature,
        secret: spec.secret,
        howToFix: [
          `Set ${spec.name} to complete this feature's configuration, or unset the whole group to disable the feature cleanly.`,
        ],
      };
    }
    return {
      name: spec.name,
      classification: "optional",
      reason: `${spec.name} is not set. This is a supported state — the feature reports itself as not configured rather than failing.`,
      feature: spec.feature,
      secret: spec.secret,
    };
  }

  if (spec.validate) {
    const res = spec.validate(value, ctx);
    if (!res.ok) {
      return {
        name: spec.name,
        classification: "invalid",
        reason: res.reason ?? `${spec.name} has an invalid value.`,
        feature: spec.feature,
        secret: spec.secret,
        howToFix: res.fix,
      };
    }
  }

  if (verifiedNames.has(spec.name)) {
    return {
      name: spec.name,
      classification: "verified",
      reason: `${spec.name} is set and was independently proven to work during this check run.`,
      feature: spec.feature,
      secret: spec.secret,
    };
  }

  return {
    name: spec.name,
    classification: "configured",
    reason: `${spec.name} is set and structurally valid. It has not been proven to work — that requires actually using it.`,
    feature: spec.feature,
    secret: spec.secret,
  };
}

export function classifyEnvironment(
  ctx: EnvEvalContext,
  verifiedNames: ReadonlySet<string> = new Set()
): EnvVarReport[] {
  return ENV_CATALOG.map((spec) => classifyEnvVar(spec, ctx, verifiedNames));
}

/**
 * Roll the per-variable reports up into check results. One check per
 * variable: a single aggregate "environment: 3 problems" row would force the
 * operator to go hunting, and each variable has its own distinct fix.
 */
export function environmentChecksFrom(reports: EnvVarReport[]): CheckResult[] {
  return reports.map((r) => {
    const spec = ENV_CATALOG.find((s) => s.name === r.name);
    const status = statusForClassification(r.classification);
    return {
      id: `env.${r.name}`,
      group: "environment" as const,
      label: r.name,
      status,
      summary: r.reason,
      detail: `Affects: ${r.feature}${r.secret ? " — this is a secret; its value is never displayed, logged, or returned by this installer." : ""}`,
      howToFix: r.howToFix,
      blocking:
        status === "fail" &&
        (spec?.requirement === "required" || spec?.requirement === "required-in-production"),
    };
  });
}

export function statusForClassification(c: EnvClassification): CheckResult["status"] {
  switch (c) {
    case "missing":
      return "fail";
    case "invalid":
      return "fail";
    case "verified":
      return "pass";
    case "configured":
      return "pass";
    case "optional":
      return "optional";
  }
}
