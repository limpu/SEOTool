import { z } from "zod";

// Phase 34 (Production Readiness): fail fast, at boot, with a clear message,
// rather than letting a missing required env var surface as a confusing
// deep-in-a-request-handler error (e.g. `JWT_SECRET environment variable is
// not set.` thrown from inside `getJwtSecret()` on the first login attempt,
// or a raw `pg` connection-string parse error from inside a random API
// route the first time it happens to touch the DB).
//
// Scope deliberately mirrors this codebase's existing "graceful optional
// feature" pattern (Phase 26 GSC, Phase 29 AI/Ollama): only variables the
// app cannot function *at all* without are required here. Feature-scoped
// variables (GOOGLE_CLIENT_ID/SECRET, GSC_TOKEN_ENCRYPTION_KEY, OLLAMA_*,
// EMAIL_*) stay optional — those features already have their own honest
// "not configured" runtime states (see the Search Console report / ai router), and
// requiring them here would break local dev / any environment that hasn't
// set up those optional integrations yet, which is not this validator's job.
const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required (Postgres connection string)." })
    .min(1, "DATABASE_URL must not be empty.")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string."
    ),
  JWT_SECRET: z
    .string({ error: "JWT_SECRET is required (session/state-token signing key)." })
    .min(
      32,
      "JWT_SECRET should be at least 32 characters — generate with: node -e \"require('crypto').randomBytes(32).toString('base64url')\""
    ),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

let validated: ValidatedEnv | null = null;

/**
 * Validate required environment variables once, at process boot.
 * Throws a single, clear, aggregated error (every missing/invalid var
 * listed at once, not one-at-a-time as each is first touched) if anything
 * required is missing or malformed. Safe to call multiple times — only
 * validates once per process.
 */
export function validateEnv(): ValidatedEnv {
  if (validated) return validated;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `\n\nEnvironment validation failed — the app cannot start.\n` +
        `Fix the following in your .env file, then restart:\n\n${issues}\n\n` +
        `See .env for the full list of variables and .env's own inline comments ` +
        `for how to generate secrets and which features degrade gracefully when unset.\n`
    );
  }

  validated = result.data;
  return validated;
}

/** Test-only: reset the memoized validation result between test cases. */
export function __resetEnvValidationForTests() {
  validated = null;
}
