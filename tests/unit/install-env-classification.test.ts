import { describe, expect, it } from "vitest";
import {
  ENV_CATALOG,
  classifyEnvVar,
  classifyEnvironment,
  environmentChecksFrom,
  statusForClassification,
} from "@/lib/install/checks/environment";
import { evaluateAppUrl } from "@/lib/install/checks/network";

/**
 * Web Installer — environment classification tests.
 *
 * The thesis under test is "presence is not validity". Several of these cases
 * describe variables that are set, non-empty and correctly formatted, and are
 * still wrong for the environment they are in — which is the failure mode
 * that actually bites operators.
 */
function spec(name: string) {
  const s = ENV_CATALOG.find((c) => c.name === name);
  if (!s) throw new Error(`No catalog entry for ${name}`);
  return s;
}

const dev = (env: Record<string, string>) => ({ isProduction: false, env: env as NodeJS.ProcessEnv });
const prod = (env: Record<string, string>) => ({ isProduction: true, env: env as NodeJS.ProcessEnv });

describe("env catalog", () => {
  it("is derived from code, including a variable that appears in no .env file", () => {
    // `PAGESPEED_CHROME_PATH` is read by src/lib/pagespeed/lighthouse-runner.ts
    // but is absent from this repo's .env — proof the list came from usage,
    // not from documentation.
    expect(ENV_CATALOG.map((s) => s.name)).toContain("PAGESPEED_CHROME_PATH");
  });

  it("marks every genuine secret as secret, so its value can never be displayed", () => {
    const secrets = ENV_CATALOG.filter((s) => s.secret).map((s) => s.name);
    expect(secrets).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "JWT_SECRET",
        "EMAIL_PASS",
        "GOOGLE_CLIENT_SECRET",
        "GSC_TOKEN_ENCRYPTION_KEY",
        "GA4_TOKEN_ENCRYPTION_KEY",
      ])
    );
  });

  it("has no duplicate entries", () => {
    const names = ENV_CATALOG.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("classification — missing / optional", () => {
  it("classifies an unset REQUIRED variable as missing", () => {
    const r = classifyEnvVar(spec("DATABASE_URL"), dev({}));
    expect(r.classification).toBe("missing");
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("classifies an unset FEATURE variable as optional in a fully-unconfigured group — a supported state", () => {
    const r = classifyEnvVar(spec("GOOGLE_CLIENT_SECRET"), dev({}));
    expect(r.classification).toBe("optional");
    expect(r.reason).toMatch(/supported state/i);
  });

  it("classifies an unset FEATURE variable as MISSING when the rest of its group IS configured", () => {
    // Half-configured is worse than unconfigured: the feature takes the
    // "really try it" path and fails at run time.
    const r = classifyEnvVar(
      spec("GOOGLE_CLIENT_SECRET"),
      dev({ GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" })
    );
    expect(r.classification).toBe("missing");
    expect(r.reason).toMatch(/half-configured/i);
  });

  it("classifies required-in-production variables as optional in dev and missing in production", () => {
    expect(classifyEnvVar(spec("EMAIL_HOST"), dev({})).classification).toBe("optional");
    expect(classifyEnvVar(spec("EMAIL_HOST"), prod({})).classification).toBe("missing");
  });
});

describe("classification — invalid (presence is NOT validity)", () => {
  it("THE CASE: a localhost Google redirect URI is INVALID for production, though it is set and well-formed", () => {
    const value = "http://localhost:3000/api/gsc/callback";
    // In development the exact same string is fine.
    expect(
      classifyEnvVar(spec("GOOGLE_OAUTH_REDIRECT_URI"), dev({ GOOGLE_OAUTH_REDIRECT_URI: value }))
        .classification
    ).toBe("configured");

    const r = classifyEnvVar(spec("GOOGLE_OAUTH_REDIRECT_URI"), prod({ GOOGLE_OAUTH_REDIRECT_URI: value }));
    expect(r.classification).toBe("invalid");
    expect(r.reason).toMatch(/redirect_uri_mismatch/);
    expect(r.reason).toMatch(/EXACT string/i);
    expect(r.howToFix?.length).toBeGreaterThan(0);
  });

  it("rejects a Google redirect URI pointing at the wrong callback path", () => {
    const r = classifyEnvVar(
      spec("GOOGLE_GA4_OAUTH_REDIRECT_URI"),
      prod({ GOOGLE_GA4_OAUTH_REDIRECT_URI: "https://seo.example.com/api/gsc/callback" })
    );
    expect(r.classification).toBe("invalid");
    expect(r.reason).toMatch(/\/api\/ga4\/callback/);
  });

  it("accepts the correct production Google redirect URIs", () => {
    expect(
      classifyEnvVar(
        spec("GOOGLE_OAUTH_REDIRECT_URI"),
        prod({ GOOGLE_OAUTH_REDIRECT_URI: "https://seo.example.com/api/gsc/callback" })
      ).classification
    ).toBe("configured");
  });

  it("rejects an encryption key that does not decode to exactly 32 bytes", () => {
    const short = Buffer.alloc(24).toString("base64");
    const r = classifyEnvVar(spec("GSC_TOKEN_ENCRYPTION_KEY"), dev({ GSC_TOKEN_ENCRYPTION_KEY: short }));
    expect(r.classification).toBe("invalid");
    expect(r.reason).toMatch(/24/);
    expect(r.howToFix?.join(" ")).toMatch(/no key versioning/i);

    const good = Buffer.alloc(32).toString("base64");
    expect(
      classifyEnvVar(spec("GA4_TOKEN_ENCRYPTION_KEY"), dev({ GA4_TOKEN_ENCRYPTION_KEY: good }))
        .classification
    ).toBe("configured");
  });

  it("rejects a short JWT_SECRET and a placeholder JWT_SECRET", () => {
    expect(classifyEnvVar(spec("JWT_SECRET"), dev({ JWT_SECRET: "tooshort" })).classification).toBe(
      "invalid"
    );
    const placeholder = classifyEnvVar(
      spec("JWT_SECRET"),
      dev({ JWT_SECRET: "changeme-changeme-changeme-changeme" })
    );
    expect(placeholder.classification).toBe("invalid");
    expect(placeholder.reason).toMatch(/placeholder/i);
  });

  it("flags NODE_ENV=development on a deployment being treated as production", () => {
    const r = classifyEnvVar(spec("NODE_ENV"), prod({ NODE_ENV: "development" }));
    expect(r.classification).toBe("invalid");
    expect(r.howToFix?.join(" ")).toMatch(/NODE_ENV=production/);
  });

  it("rejects a DATABASE_URL with the wrong scheme, no host, or no database name", () => {
    expect(classifyEnvVar(spec("DATABASE_URL"), dev({ DATABASE_URL: "mysql://u:p@h/d" })).classification).toBe(
      "invalid"
    );
    expect(
      classifyEnvVar(spec("DATABASE_URL"), dev({ DATABASE_URL: "postgresql://u:p@h:5432/" })).classification
    ).toBe("invalid");
  });

  it("never places a variable's VALUE in the report, only its name and a reason", () => {
    const secret = "postgresql://u:SuperSecretValue1@h:5432/db";
    const r = classifyEnvVar(spec("DATABASE_URL"), dev({ DATABASE_URL: secret }));
    expect(JSON.stringify(r)).not.toContain("SuperSecretValue1");
  });

  it("rejects EMAIL_SECURE values that are neither 'true' nor 'false' — the code compares literally", () => {
    const r = classifyEnvVar(spec("EMAIL_SECURE"), dev({ EMAIL_SECURE: "yes" }));
    expect(r.classification).toBe("invalid");
    expect(r.reason).toMatch(/exact string 'true'/);
  });

  it("rejects an AI_PROVIDER that is not the only implemented provider", () => {
    expect(classifyEnvVar(spec("AI_PROVIDER"), dev({ AI_PROVIDER: "openai" })).classification).toBe(
      "invalid"
    );
    expect(classifyEnvVar(spec("AI_PROVIDER"), dev({ AI_PROVIDER: "ollama" })).classification).toBe(
      "configured"
    );
  });
});

describe("classification — configured vs verified", () => {
  it("a structurally valid value is only `configured` — never `verified` on shape alone", () => {
    const r = classifyEnvVar(
      spec("DATABASE_URL"),
      dev({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" })
    );
    expect(r.classification).toBe("configured");
    expect(r.reason).toMatch(/not been proven to work/i);
  });

  it("`verified` is only reached when the caller proved it worked this run", () => {
    const r = classifyEnvVar(
      spec("DATABASE_URL"),
      dev({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" }),
      new Set(["DATABASE_URL"])
    );
    expect(r.classification).toBe("verified");
    expect(r.reason).toMatch(/independently proven/i);
  });
});

describe("classification — rollup into check results", () => {
  it("maps classifications onto check statuses", () => {
    expect(statusForClassification("missing")).toBe("fail");
    expect(statusForClassification("invalid")).toBe("fail");
    expect(statusForClassification("configured")).toBe("pass");
    expect(statusForClassification("verified")).toBe("pass");
    expect(statusForClassification("optional")).toBe("optional");
  });

  it("produces one check per variable, with a stable id and no secret values", () => {
    const reports = classifyEnvironment(
      prod({
        DATABASE_URL: "postgresql://u:SuperSecretValue1@h:5432/db",
        JWT_SECRET: "x".repeat(40),
      })
    );
    const checks = environmentChecksFrom(reports);
    expect(checks.length).toBe(ENV_CATALOG.length);
    expect(checks.map((c) => c.id)).toContain("env.DATABASE_URL");
    expect(JSON.stringify(checks)).not.toContain("SuperSecretValue1");
    // Secrets are marked as such in the visible detail.
    expect(checks.find((c) => c.id === "env.JWT_SECRET")?.detail).toMatch(/never displayed/i);
  });

  it("marks required failures as blocking and optional ones as not", () => {
    const checks = environmentChecksFrom(classifyEnvironment(prod({})));
    expect(checks.find((c) => c.id === "env.DATABASE_URL")?.blocking).toBe(true);
    expect(checks.find((c) => c.id === "env.OLLAMA_MODEL")?.blocking).toBe(false);
  });
});

describe("NEXT_PUBLIC_APP_URL consistency", () => {
  it("FAILS on a localhost app URL in production and explains the build-time inlining", () => {
    const r = evaluateAppUrl({
      configured: "http://localhost:3000",
      requestHost: "seo.example.com",
      requestProtocol: "https",
      isProduction: true,
    });
    expect(r.status).toBe("fail");
    expect(r.summary).toMatch(/invalid for production/i);
    expect(r.detail).toMatch(/BUILD time/i);
  });

  it("PASSES when the configured origin matches the host the request arrived at", () => {
    const r = evaluateAppUrl({
      configured: "https://seo.example.com",
      requestHost: "seo.example.com",
      requestProtocol: "https",
      isProduction: true,
    });
    expect(r.status).toBe("pass");
  });

  it("reports a host mismatch — fail in production, warn otherwise", () => {
    const base = { configured: "https://seo.example.com", requestHost: "other.example.com" } as const;
    expect(evaluateAppUrl({ ...base, requestProtocol: "https", isProduction: true }).status).toBe("fail");
    expect(evaluateAppUrl({ ...base, requestProtocol: "https", isProduction: false }).status).toBe("warn");
  });

  it("treats a localhost app URL in development as OPTIONAL rather than broken", () => {
    const r = evaluateAppUrl({
      configured: "http://localhost:3000",
      requestHost: "localhost:3000",
      requestProtocol: "http",
      isProduction: false,
    });
    expect(r.status).toBe("optional");
  });

  it("FAILS on an unparseable value and on http:// in production", () => {
    expect(
      evaluateAppUrl({
        configured: "seo.example.com",
        requestHost: null,
        requestProtocol: "https",
        isProduction: true,
      }).status
    ).toBe("fail");
    expect(
      evaluateAppUrl({
        configured: "http://seo.example.com",
        requestHost: "seo.example.com",
        requestProtocol: "https",
        isProduction: true,
      }).status
    ).toBe("fail");
  });

  it("FAILS when unset in production and WARNS when unset in development", () => {
    expect(
      evaluateAppUrl({ configured: undefined, requestHost: "h", requestProtocol: "https", isProduction: true })
        .status
    ).toBe("fail");
    expect(
      evaluateAppUrl({ configured: "", requestHost: "h", requestProtocol: "http", isProduction: false }).status
    ).toBe("warn");
  });
});
