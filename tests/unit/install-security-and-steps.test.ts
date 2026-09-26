import { describe, expect, it } from "vitest";
import {
  evaluateAdminExists,
  evaluateClientBundleExposure,
  evaluateInstallerLock,
  evaluateSecretStrength,
  evaluateSuperAdminAssigned,
  findSuspiciousPublicVars,
} from "@/lib/install/checks/security";
import {
  evaluateGoogleIntegration,
  evaluateOllamaIntegration,
  evaluateSmtpIntegration,
} from "@/lib/install/checks/integrations";
import { classifyEnvironment } from "@/lib/install/checks/environment";
import { evaluateChromium } from "@/lib/install/checks/chromium";
import { assertActionable, deriveSteps, summarise } from "@/lib/install/checks";
import { detectDeploymentMode, renderConfigGuidance } from "@/lib/install/deployment";
import type { CheckResult } from "@/lib/install/types";
import type { InstallationStateSnapshot } from "@/lib/install/state";

const fresh: InstallationStateSnapshot = {
  status: "not_complete",
  completed: false,
  completedAt: null,
  completedByUserId: null,
  steps: {},
};

function check(id: string, status: CheckResult["status"], extra: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    group: "runtime",
    label: id,
    status,
    summary: `${id} is ${status}`,
    ...extra,
  };
}

describe("security — client bundle exposure", () => {
  it("catches secret-sounding NEXT_PUBLIC_ names", () => {
    expect(
      findSuspiciousPublicVars([
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_API_KEY",
        "NEXT_PUBLIC_JWT_SECRET",
        "NEXT_PUBLIC_DATABASE_URL",
        "JWT_SECRET",
      ])
    ).toEqual(["NEXT_PUBLIC_API_KEY", "NEXT_PUBLIC_JWT_SECRET", "NEXT_PUBLIC_DATABASE_URL"]);
  });

  it("FAILS and says the credential must be considered compromised, not just misconfigured", () => {
    const r = evaluateClientBundleExposure({
      publicVarNames: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_GOOGLE_CLIENT_SECRET"],
    });
    expect(r.status).toBe("fail");
    expect(r.blocking).toBe(true);
    expect(r.detail).toMatch(/readable by every visitor/i);
    expect(r.howToFix?.join(" ")).toMatch(/rotate/i);
  });

  it("PASSES on a clean set, and states it matched on names only", () => {
    const r = evaluateClientBundleExposure({ publicVarNames: ["NEXT_PUBLIC_APP_URL"] });
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/NAMES only/);
  });
});

describe("security — administrator posture", () => {
  it("FAILS when no SUPER_ADMIN exists, and frames it as the installer's purpose", () => {
    const r = evaluateAdminExists({ userCount: 0, superAdminCount: 0 });
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/zero-privilege USER role/i);
    expect(r.howToFix?.join(" ")).toMatch(/FIRST one/);
  });

  it("PASSES when one exists, and states the installer must not create another", () => {
    const r = evaluateAdminExists({ userCount: 5, superAdminCount: 1 });
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/must not create another/i);
  });

  it("is UNKNOWN — never 'zero administrators' — when the database could not be read", () => {
    const r = evaluateAdminExists({ userCount: null, superAdminCount: null });
    expect(r.status).toBe("unknown");
    expect(r.status).not.toBe("fail");
  });

  it("flags existing users with no SUPER_ADMIN among them", () => {
    const r = evaluateSuperAdminAssigned({ userCount: 12, superAdminCount: 0 });
    expect(r.status).toBe("fail");
    expect(r.summary).toContain("12");
  });

  it("PASSES when SUPER_ADMIN is held", () => {
    expect(evaluateSuperAdminAssigned({ userCount: 3, superAdminCount: 2 }).status).toBe("pass");
  });
});

describe("security — installer lock", () => {
  it("PASSES once complete, and tells the operator to delete the token file", () => {
    const r = evaluateInstallerLock("complete", true, true);
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/survives redeploys/i);
    expect(r.howToFix?.join(" ")).toMatch(/\.install-token/);
  });

  it("WARNS while open, and says the token is the only thing protecting it", () => {
    const r = evaluateInstallerLock("not_complete", true, true);
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/only thing preventing/i);
  });

  it("notes when the 0600 permission request was not honoured", () => {
    const r = evaluateInstallerLock("not_complete", true, false);
    expect(r.detail).toMatch(/0600/);
  });

  it("is UNKNOWN with the database down, and states unknown is not treated as 'not installed'", () => {
    const r = evaluateInstallerLock("unknown", false, true);
    expect(r.status).toBe("unknown");
    expect(r.detail).toMatch(/NOT treated as 'not installed'/i);
  });
});

describe("security — secret strength", () => {
  const strong = {
    jwtSecretLength: 43,
    jwtSecretLooksPlaceholder: false,
    gscKeyBytes: 32,
    ga4KeyBytes: 32,
    googleConfigured: true,
  };

  it("PASSES on strong secrets", () => {
    expect(evaluateSecretStrength(strong).status).toBe("pass");
  });

  it("FAILS on a short JWT_SECRET and explains the OAuth-state coupling", () => {
    const r = evaluateSecretStrength({ ...strong, jwtSecretLength: 12 });
    expect(r.status).toBe("fail");
    expect(r.summary).toContain("12");
    expect(r.detail).toMatch(/OAuth state/i);
  });

  it("FAILS on a placeholder JWT_SECRET", () => {
    expect(evaluateSecretStrength({ ...strong, jwtSecretLooksPlaceholder: true }).status).toBe("fail");
  });

  it("ignores the encryption keys entirely when Google is not configured", () => {
    const r = evaluateSecretStrength({
      ...strong,
      gscKeyBytes: null,
      ga4KeyBytes: null,
      googleConfigured: false,
    });
    expect(r.status).toBe("pass");
  });

  it("FAILS on wrong-length encryption keys when Google IS configured", () => {
    const r = evaluateSecretStrength({ ...strong, gscKeyBytes: 24 });
    expect(r.status).toBe("fail");
    expect(r.summary).toContain("24");
  });

  it("never echoes a secret — only lengths and byte counts", () => {
    expect(JSON.stringify(evaluateSecretStrength({ ...strong, jwtSecretLength: 12 }))).not.toMatch(
      /[A-Za-z0-9_-]{40,}/
    );
  });
});

describe("integrations — configuration validity ONLY", () => {
  const envOf = (env: Record<string, string>, isProduction = false) => ({
    reports: classifyEnvironment({ isProduction, env: env as NodeJS.ProcessEnv }),
    env: env as NodeJS.ProcessEnv,
    isProduction,
  });

  it("Google unconfigured is OPTIONAL, a supported state", () => {
    const r = evaluateGoogleIntegration(envOf({}));
    expect(r.status).toBe("optional");
    expect(r.detail).toMatch(/fully supported state/i);
  });

  it("Google fully configured PASSES but explicitly disclaims any handshake", () => {
    const r = evaluateGoogleIntegration(
      envOf({
        GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "s".repeat(24),
        GOOGLE_OAUTH_REDIRECT_URI: "https://seo.example.com/api/gsc/callback",
        GOOGLE_GA4_OAUTH_REDIRECT_URI: "https://seo.example.com/api/ga4/callback",
        GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
        GA4_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      })
    );
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/no OAuth handshake was attempted/i);
    expect(r.detail).toMatch(/not proof/i);
  });

  it("Google half-configured FAILS and names the offending variables", () => {
    const r = evaluateGoogleIntegration(envOf({ GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" }));
    expect(r.status).toBe("fail");
    expect(r.summary).toMatch(/GOOGLE_CLIENT_SECRET/);
  });

  it("surfaces the 7-day Testing-mode refresh-token expiry when production", () => {
    const r = evaluateGoogleIntegration(
      envOf(
        {
          GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
          GOOGLE_CLIENT_SECRET: "s".repeat(24),
          GOOGLE_OAUTH_REDIRECT_URI: "https://seo.example.com/api/gsc/callback",
          GOOGLE_GA4_OAUTH_REDIRECT_URI: "https://seo.example.com/api/ga4/callback",
          GSC_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
          GA4_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
        },
        true
      )
    );
    expect(r.detail).toMatch(/7 days/);
    expect(r.detail).toMatch(/sensitive/i);
  });

  it("SMTP unconfigured is OPTIONAL in dev and FAIL in production", () => {
    expect(evaluateSmtpIntegration(envOf({})).status).toBe("optional");
    const prod = evaluateSmtpIntegration(envOf({}, true));
    expect(prod.status).toBe("fail");
    expect(prod.detail).toMatch(/NOBODY CAN COMPLETE REGISTRATION/);
  });

  it("SMTP fully configured PASSES but disclaims that any mail was sent", () => {
    const r = evaluateSmtpIntegration(
      envOf({
        EMAIL_HOST: "smtp.example.com",
        EMAIL_PORT: "587",
        EMAIL_USER: "user",
        EMAIL_PASS: "pass",
        EMAIL_FROM: "SEO <noreply@example.com>",
      })
    );
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/no test message was sent/i);
  });

  it("SMTP half-configured FAILS, explaining why that is worse than none", () => {
    const r = evaluateSmtpIntegration(
      envOf({ EMAIL_HOST: "smtp.example.com", EMAIL_PORT: "notaport", EMAIL_USER: "u" }, true)
    );
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/worse than none/i);
  });

  it("Ollama unset is OPTIONAL and explains why there is no default model", () => {
    const r = evaluateOllamaIntegration(envOf({}));
    expect(r.status).toBe("optional");
    expect(r.detail).toMatch(/no default model/i);
  });

  it("Ollama configured PASSES but disclaims that the model was ever called", () => {
    const r = evaluateOllamaIntegration(
      envOf({ OLLAMA_MODEL: "llama3.2:latest", OLLAMA_BASE_URL: "http://localhost:11434" })
    );
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/no request was made/i);
    expect(r.detail).toMatch(/host\.docker\.internal/);
  });

  it("Ollama with an invalid base URL FAILS", () => {
    const r = evaluateOllamaIntegration(
      envOf({ OLLAMA_MODEL: "llama3.2:latest", OLLAMA_BASE_URL: "not a url" })
    );
    expect(r.status).toBe("fail");
  });
});

describe("deployment mode detection", () => {
  const fakeFs = (files: Record<string, string>) => ({
    existsSync: (p: string) => p in files,
    readFileSync: (p: string) => files[p] ?? "",
  });

  it("detects Docker from /.dockerenv", () => {
    const d = detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({ "/.dockerenv": "" }), "linux");
    expect(d.mode).toBe("container");
    expect(d.envFileIsDurable).toBe(false);
    expect(d.evidence.join(" ")).toMatch(/dockerenv/);
  });

  it("detects Kubernetes from KUBERNETES_SERVICE_HOST", () => {
    const d = detectDeploymentMode(
      { KUBERNETES_SERVICE_HOST: "10.0.0.1" } as unknown as NodeJS.ProcessEnv,
      fakeFs({}),
      "linux"
    );
    expect(d.mode).toBe("container");
    expect(d.orchestrator).toBe("kubernetes");
  });

  it("detects a container from PID 1's cgroup", () => {
    const d = detectDeploymentMode(
      {} as unknown as NodeJS.ProcessEnv,
      fakeFs({ "/proc/1/cgroup": "0::/docker/abc123" }),
      "linux"
    );
    expect(d.mode).toBe("container");
  });

  it("detects a traditional Linux host with no container markers", () => {
    const d = detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({}), "linux");
    expect(d.mode).toBe("traditional");
    expect(d.envFileIsDurable).toBe(true);
    // Even on a VPS, a restart is required — process.env is never reloaded.
    expect(d.restartRequired).toBe(true);
  });

  it("treats Windows as traditional", () => {
    expect(detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({}), "win32").mode).toBe("traditional");
  });

  it("fails CLOSED on an unrecognised platform — never claims a file write will persist", () => {
    const d = detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({}), "aix");
    expect(d.mode).toBe("unknown");
    expect(d.envFileIsDurable).toBe(false);
  });

  it("gives container operators a compose snippet and refuses to pretend a .env would persist", () => {
    const d = detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({ "/.dockerenv": "" }), "linux");
    const g = renderConfigGuidance(d, ["EMAIL_HOST", "EMAIL_PASS"]);
    expect(g.snippet).toContain("environment:");
    expect(g.snippet).toContain("EMAIL_HOST");
    expect(g.steps.join(" ")).toMatch(/erased by the next redeploy/i);
    // Names only — no value is ever placed in guidance.
    expect(g.snippet).toContain('"<value>"');
  });

  it("tells VPS operators plainly that a restart is required", () => {
    const d = detectDeploymentMode({} as unknown as NodeJS.ProcessEnv, fakeFs({}), "linux");
    const g = renderConfigGuidance(d, ["EMAIL_HOST"]);
    expect(g.steps.join(" ")).toMatch(/RESTART IS REQUIRED/);
    expect(g.steps.join(" ")).toMatch(/out of any public\/static directory/i);
    expect(g.steps.join(" ")).toMatch(/BUILD time/);
  });
});

describe("engine — actionability and summarising", () => {
  it("never lets a `fail` escape without remediation", () => {
    const r = assertActionable(check("x.y", "fail"));
    expect(r.howToFix?.length).toBeGreaterThan(0);
    expect(r.howToFix?.join(" ")).toMatch(/defect in the check itself/i);
  });

  it("leaves an already-actionable failure untouched", () => {
    const original = check("x.y", "fail", { howToFix: ["do the thing"] });
    expect(assertActionable(original)).toBe(original);
  });

  it("does not add remediation to non-failures", () => {
    expect(assertActionable(check("x.y", "pass")).howToFix).toBeUndefined();
  });

  it("summarises statuses", () => {
    expect(
      summarise([check("a", "pass"), check("b", "pass"), check("c", "fail"), check("d", "optional")])
    ).toEqual({ pass: 2, warn: 0, fail: 1, optional: 1, unknown: 0 });
  });
});

describe("engine — next required step is DERIVED, not a fixed sequence", () => {
  const passing = (over: CheckResult[] = []): CheckResult[] => {
    const defaults: CheckResult[] = [
      check("runtime.node", "pass"),
      check("database.reachable", "pass"),
      check("database.version", "pass"),
      check("database.migrations", "pass"),
      check("security.secrets", "pass"),
      check("security.client-bundle", "pass"),
      check("network.https", "pass"),
      check("network.app-url", "pass"),
      check("security.admin-exists", "pass"),
    ];
    const byId = new Map(defaults.map((c) => [c.id, c]));
    for (const o of over) byId.set(o.id, o);
    return [...byId.values()];
  };

  it("skips straight to the administrator step when everything else is already satisfied", () => {
    // The operator who supplied a complete .env before first boot must not be
    // walked through four screens that have nothing to do.
    const steps = deriveSteps(passing([check("security.admin-exists", "fail")]), fresh, false);
    const next = steps.find((s) => !s.satisfied);
    expect(next?.id).toBe("administrator");
  });

  it("reports every step satisfied when nothing is outstanding", () => {
    expect(deriveSteps(passing(), fresh, false).every((s) => s.satisfied)).toBe(true);
  });

  it("returns to the database step if the database goes away mid-installation", () => {
    const steps = deriveSteps(
      passing([
        check("database.reachable", "fail", { summary: "The database refused the connection." }),
        check("security.admin-exists", "fail"),
      ]),
      fresh,
      false
    );
    expect(steps.find((s) => !s.satisfied)?.id).toBe("database");
  });

  it("puts runtime ahead of everything — nothing else is trustworthy on the wrong runtime", () => {
    const steps = deriveSteps(
      passing([check("runtime.node", "fail"), check("database.reachable", "fail")]),
      fresh,
      false
    );
    expect(steps.find((s) => !s.satisfied)?.id).toBe("runtime");
  });

  it("blocks on unapplied migrations", () => {
    const steps = deriveSteps(passing([check("database.migrations", "fail")]), fresh, false);
    expect(steps.find((s) => !s.satisfied)?.id).toBe("migrations");
  });

  it("does NOT block on warnings — that is the whole meaning of warn", () => {
    const steps = deriveSteps(
      passing([
        check("network.https", "warn"),
        check("database.migrations", "pass"),
      ]),
      fresh,
      false
    );
    expect(steps.find((s) => s.id === "transport")?.satisfied).toBe(true);
  });

  it("blocks the transport step on a production HTTPS failure", () => {
    const steps = deriveSteps(
      passing([check("network.https", "fail", { summary: "Plain HTTP in production." })]),
      fresh,
      true
    );
    const transport = steps.find((s) => s.id === "transport");
    expect(transport?.satisfied).toBe(false);
    expect(transport?.reason).toMatch(/Plain HTTP/);
  });

  it("blocks everything downstream of the database while installation state is unknown", () => {
    const unknownState: InstallationStateSnapshot = { ...fresh, status: "unknown" };
    const steps = deriveSteps(passing(), unknownState, false);
    const db = steps.find((s) => s.id === "database");
    expect(db?.satisfied).toBe(false);
    expect(db?.reason).toMatch(/could not be read/i);
  });

  it("gives every step a real, non-empty reason — never a bare status", () => {
    for (const s of deriveSteps(passing(), fresh, false)) {
      expect(s.reason.length).toBeGreaterThan(10);
      expect(s.gatedBy.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts required environment failures into the environment step", () => {
    const steps = deriveSteps(
      passing([
        { ...check("env.DATABASE_URL", "fail"), group: "environment", blocking: true },
        { ...check("env.JWT_SECRET", "fail"), group: "environment", blocking: true },
      ]),
      fresh,
      false
    );
    const envStep = steps.find((s) => s.id === "environment");
    expect(envStep?.satisfied).toBe(false);
    expect(envStep?.reason).toMatch(/2 required/);
    expect(envStep?.reason).toMatch(/DATABASE_URL/);
  });
});

describe("integrations — SMTP host without credentials (the half-configured dev case)", () => {
  it("reports OPTIONAL, not PASS, when a host is set but no credentials are — no mail is actually sent", () => {
    const env: Record<string, string> = { EMAIL_HOST: "smtp.ethereal.email", EMAIL_PORT: "587", EMAIL_SECURE: "false" };
    const r = evaluateSmtpIntegration({
      reports: classifyEnvironment({ isProduction: false, env: env as NodeJS.ProcessEnv }),
      env: env as NodeJS.ProcessEnv,
      isProduction: false,
    });
    expect(r.status).toBe("optional");
    expect(r.status).not.toBe("pass");
    expect(r.summary).toMatch(/logged to the server console/i);
    expect(r.howToFix?.join(" ")).toMatch(/EMAIL_USER/);
  });

  it("becomes a hard failure in production", () => {
    const env: Record<string, string> = { EMAIL_HOST: "smtp.example.com", EMAIL_PORT: "587" };
    const r = evaluateSmtpIntegration({
      reports: classifyEnvironment({ isProduction: true, env: env as NodeJS.ProcessEnv }),
      env: env as NodeJS.ProcessEnv,
      isProduction: true,
    });
    expect(r.status).toBe("fail");
  });
});

describe("chromium — version banner selection", () => {
  it("ignores Windows' 'Opening in existing browser session.' noise line", () => {
    // Reporting that line as the version would be a meaningless success
    // message dressed up as a measurement.
    const r = evaluateChromium({
      resolvedPath: "C:\chrome.exe",
      source: "well-known-path",
      versionOutput: "Google Chrome 151.0.7259.0",
      executionError: null,
      configuredPathMissing: false,
    });
    expect(r.summary).toContain("Google Chrome 151");
    expect(r.summary).not.toMatch(/Opening in existing/);
  });

  it("says so honestly when the binary ran but printed no recognisable version", () => {
    const r = evaluateChromium({
      resolvedPath: "/usr/bin/chromium",
      source: "well-known-path",
      versionOutput: null,
      executionError: null,
      configuredPathMissing: false,
    });
    expect(r.status).toBe("pass");
    expect(r.summary).toMatch(/did not print a recognisable version/i);
  });
});
