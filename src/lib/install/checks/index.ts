import path from "path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { CheckContext, CheckResult, EnvVarReport } from "../types";
import { detectDeploymentMode, type DeploymentDetection } from "../deployment";
import { readInstallationState, type InstallationStateSnapshot } from "../state";
import { getInstallTokenPath } from "../token";
import { checkNodeVersion, checkPackageManager } from "./runtime";
import { checkChromium } from "./chromium";
import { checkDisk, checkMemory } from "./resources";
import {
  evaluateDatabaseReachable,
  evaluateDatabaseVersion,
  probeDatabase,
  type DatabaseProbeResult,
} from "./database";
import { checkMigrations, type MigrationReport } from "./migrations";
import { evaluateAppUrl, evaluateHttps } from "./network";
import { classifyEnvironment, environmentChecksFrom } from "./environment";
import {
  evaluateAdminExists,
  evaluateClientBundleExposure,
  evaluateInstallerLock,
  evaluateSecretStrength,
  evaluateSuperAdminAssigned,
} from "./security";
import {
  evaluateGoogleIntegration,
  evaluateOllamaIntegration,
  evaluateSmtpIntegration,
} from "./integrations";
import { checkHealthEndpoint } from "./health";

/**
 * Web Installer — the detection engine's orchestrator.
 *
 * Runs every check, enforces the "no bare technical errors" rule, and derives
 * the next required step from the RESULTS rather than from a hard-coded
 * sequence. Everything here is read-only: nothing in this module or anything
 * it calls writes to the database, the filesystem, or any external service.
 */

/**
 * Every `fail` must carry remediation. This is enforced at runtime rather
 * than left to reviewer discipline, because "the check that has no howToFix
 * is the one the user hits" is exactly how an installer ends up showing
 * somebody `ECONNREFUSED` and nothing else. A missing `howToFix` is a bug in
 * the check, and the fallback text says so rather than silently rendering an
 * empty list.
 */
export function assertActionable(result: CheckResult): CheckResult {
  if (result.status !== "fail") return result;
  if (result.howToFix && result.howToFix.length > 0) return result;
  return {
    ...result,
    howToFix: [
      "No specific remediation was recorded for this failure — this is a defect in the check itself.",
      "Check the application's server logs for the underlying cause, and report this check id so remediation guidance can be added.",
    ],
  };
}

export interface AdminPostureCounts {
  userCount: number | null;
  superAdminCount: number | null;
}

/**
 * Count users and SUPER_ADMINs. COUNTS ONLY — this never selects an email, a
 * name, a password hash or any other user field. The installer has no
 * business reading existing user data, and structuring the query this way
 * means it cannot accidentally start to.
 */
export async function collectAdminPosture(): Promise<AdminPostureCounts> {
  try {
    const users = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM users`);
    const supers = await db.execute<{ count: string }>(
      sql`SELECT count(DISTINCT ur.user_id)::text AS count
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE r.key = 'SUPER_ADMIN'`
    );
    const userRows = (users as unknown as { rows?: { count: string }[] }).rows ?? [];
    const superRows = (supers as unknown as { rows?: { count: string }[] }).rows ?? [];
    return {
      userCount: Number(userRows[0]?.count ?? 0),
      superAdminCount: Number(superRows[0]?.count ?? 0),
    };
  } catch {
    // Unreachable database, or migrations not yet applied. Both are honestly
    // "unknown", never "zero" — reporting zero administrators on a database
    // we could not read would be a fabricated fact, and a dangerous one.
    return { userCount: null, superAdminCount: null };
  }
}

export interface InstallStatusReport {
  generatedAt: string;
  installation: InstallationStateSnapshot;
  deployment: DeploymentDetection;
  isProduction: boolean;
  checks: CheckResult[];
  environment: EnvVarReport[];
  migrations: MigrationReport | null;
  summary: Record<CheckResult["status"], number>;
  nextRequiredStep: NextStep;
  /** Every step, with its current state — so the UI can show real progress. */
  steps: NextStep[];
}

export interface NextStep {
  id: string;
  label: string;
  /** Why this step is or is not satisfied — always a real sentence. */
  reason: string;
  satisfied: boolean;
  /** Check ids that decide this step. */
  gatedBy: string[];
  /** True when this step cannot even be attempted yet. */
  blockedByEarlierStep?: boolean;
}

/** Run the whole detection engine. Read-only from top to bottom. */
export async function runAllChecks(ctx: CheckContext = {}): Promise<InstallStatusReport> {
  const projectRoot = ctx.projectRoot ?? process.cwd();
  const env = process.env;
  const isProduction = ctx.assumeProduction ?? env.NODE_ENV === "production";

  const installation = await readInstallationState();
  const deployment = detectDeploymentMode(env);

  const connectionString = ctx.databaseUrlOverride ?? env.DATABASE_URL;

  // Independent I/O in parallel — this endpoint is polled by the wizard and
  // a serial run would make it feel broken.
  const [dbProbe, migrations, chromium, packageManager, disk, adminPosture] = await Promise.all([
    probeDatabase(connectionString),
    checkMigrations(projectRoot, connectionString),
    checkChromium(env),
    checkPackageManager("pnpm"),
    checkDisk(projectRoot),
    collectAdminPosture(),
  ]);

  // `verified` is earned, not assumed: only variables independently proven to
  // work THIS RUN are promoted above `configured`.
  const verified = new Set<string>();
  if (dbProbe.reachable) verified.add("DATABASE_URL");
  if (chromium.status === "pass" && env.PAGESPEED_CHROME_PATH) verified.add("PAGESPEED_CHROME_PATH");

  const environment = classifyEnvironment({ isProduction, env }, verified);

  const requestHost = ctx.requestHost ?? null;
  const requestProtocol = ctx.requestProtocol ?? "http";

  const googleConfigured = !!env.GOOGLE_CLIENT_ID?.trim();
  const checks: CheckResult[] = [
    // Runtime
    checkNodeVersion(),
    packageManager,
    chromium,
    // Resources
    checkMemory(),
    disk,
    // Database
    evaluateDatabaseReachable(dbProbe),
    evaluateDatabaseVersion(dbProbe),
    migrations.result,
    // Network / addressing
    evaluateHttps({
      protocol: requestProtocol,
      viaProxyHeader: ctx.requestProtocol !== undefined,
      host: requestHost,
      isProduction,
    }),
    evaluateAppUrl({
      configured: env.NEXT_PUBLIC_APP_URL,
      requestHost,
      requestProtocol,
      isProduction,
    }),
    // Environment (one row per variable — each has its own distinct fix)
    ...environmentChecksFrom(environment),
    // Security posture
    evaluateSecretStrength({
      jwtSecretLength: (env.JWT_SECRET ?? "").trim().length,
      jwtSecretLooksPlaceholder: /^(changeme|secret|password|test|dev|development|your[-_]?secret)/i.test(
        (env.JWT_SECRET ?? "").trim()
      ),
      gscKeyBytes: decodedKeyBytes(env.GSC_TOKEN_ENCRYPTION_KEY),
      ga4KeyBytes: decodedKeyBytes(env.GA4_TOKEN_ENCRYPTION_KEY),
      googleConfigured,
    }),
    evaluateClientBundleExposure({
      publicVarNames: Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_")),
    }),
    evaluateAdminExists(adminPosture),
    evaluateSuperAdminAssigned(adminPosture),
    evaluateInstallerLock(
      installation.status,
      await tokenFileExists(projectRoot),
      process.platform !== "win32"
    ),
    // Integrations — configuration validity only in Stage 1
    evaluateGoogleIntegration({ reports: environment, env, isProduction }),
    evaluateSmtpIntegration({ reports: environment, env, isProduction }),
    evaluateOllamaIntegration({ reports: environment, env, isProduction }),
  ];

  // Health is a self-request, so it needs the origin the installer was
  // actually reached at.
  if (requestHost) {
    checks.push(await checkHealthEndpoint(`${requestProtocol}://${requestHost}`));
  }

  // Deployment mode is informational, never a pass/fail judgement — there is
  // nothing wrong with either mode. It is reported so the operator can see
  // WHICH set of configuration instructions applies to them.
  checks.push({
    id: "deployment.mode",
    group: "deployment",
    label: "Deployment mode",
    status: "pass",
    summary:
      deployment.mode === "container"
        ? `Containerised deployment detected${deployment.orchestrator ? ` (${deployment.orchestrator})` : ""}.`
        : deployment.mode === "traditional"
          ? "Traditional (VPS / bare-metal) deployment detected."
          : "Deployment mode could not be determined.",
    detail:
      deployment.evidence.join(" ") +
      (deployment.envFileIsDurable
        ? " Writing .env is durable here, but a RESTART IS REQUIRED before new values take effect — Next.js reads .env once at process start and process.env is never reloaded at runtime."
        : " A .env file written inside the container is ephemeral and is destroyed by the next redeploy, so configuration must be injected as environment variables by the orchestrator instead. This installer will not pretend otherwise."),
  });

  const finalChecks = checks.map(assertActionable);
  const summary = summarise(finalChecks);
  const steps = deriveSteps(finalChecks, installation, isProduction);
  const nextRequiredStep =
    steps.find((s) => !s.satisfied) ?? {
      id: "complete",
      label: "Complete the installation",
      reason:
        "Every required check has passed. The installation can be completed, which permanently disables the installer for this database.",
      satisfied: true,
      gatedBy: [],
    };

  return {
    generatedAt: new Date().toISOString(),
    installation,
    deployment,
    isProduction,
    checks: finalChecks,
    environment,
    migrations: migrations.report,
    summary,
    nextRequiredStep,
    steps,
  };
}

function decodedKeyBytes(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  try {
    return Buffer.from(value.trim(), "base64").length;
  } catch {
    return 0;
  }
}

async function tokenFileExists(projectRoot: string): Promise<boolean> {
  const fs = await import("fs/promises");
  try {
    await fs.access(getInstallTokenPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}

export function summarise(checks: CheckResult[]): Record<CheckResult["status"], number> {
  const out: Record<CheckResult["status"], number> = {
    pass: 0,
    warn: 0,
    fail: 0,
    optional: 0,
    unknown: 0,
  };
  for (const c of checks) out[c.status] += 1;
  return out;
}

/**
 * Derive the installation steps and which one is next.
 *
 * ─── DYNAMIC, NOT A FIXED SEQUENCE ──────────────────────────────────────
 * The next step is computed from the CURRENT CHECK RESULTS every time. That
 * matters because the real ordering is not fixed: an operator who supplied a
 * complete `.env` before first boot arrives with the database, environment
 * and security steps already satisfied and should be taken straight to
 * creating the administrator, not walked through four screens that have
 * nothing to do. Equally, if the database goes away midway through, the
 * database step becomes the next required step again — regardless of how far
 * the wizard had already got.
 *
 * A step is satisfied when none of its gating checks is a blocking `fail`.
 * `warn` never blocks (that is what makes it a warn), and `unknown` blocks
 * only the steps that genuinely cannot proceed without the measurement.
 */
export function deriveSteps(
  checks: CheckResult[],
  installation: InstallationStateSnapshot,
  isProduction: boolean
): NextStep[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const has = (ids: string[], statuses: CheckResult["status"][]) =>
    ids.filter((id) => {
      const c = byId.get(id);
      return c ? statuses.includes(c.status) : false;
    });

  const envRequiredIds = checks
    .filter((c) => c.group === "environment" && c.blocking)
    .map((c) => c.id);

  const steps: NextStep[] = [];

  // 1. Runtime — nothing else can be trusted if the runtime is wrong.
  const runtimeGates = ["runtime.node"];
  const runtimeFails = has(runtimeGates, ["fail"]);
  steps.push({
    id: "runtime",
    label: "Runtime requirements",
    gatedBy: runtimeGates,
    satisfied: runtimeFails.length === 0,
    reason:
      runtimeFails.length === 0
        ? "Node.js meets the required baseline."
        : "The Node.js runtime does not meet the required baseline; upgrade it before continuing.",
  });

  // 2. Database connection.
  const dbGates = ["database.reachable", "database.version"];
  const dbFails = has(dbGates, ["fail"]);
  const dbUnknown = installation.status === "unknown";
  steps.push({
    id: "database",
    label: "Database connection",
    gatedBy: dbGates,
    satisfied: dbFails.length === 0 && !dbUnknown,
    reason:
      dbFails.length > 0
        ? byId.get("database.reachable")?.status === "fail"
          ? (byId.get("database.reachable")?.summary ?? "The database is not reachable.")
          : (byId.get("database.version")?.summary ?? "The database version is not supported.")
        : dbUnknown
          ? "Installation state could not be read from the database, so nothing can be changed yet."
          : "The database is reachable and its version is supported.",
  });

  // 3. Schema/migrations.
  const migrationCheck = byId.get("database.migrations");
  steps.push({
    id: "migrations",
    label: "Database schema",
    gatedBy: ["database.migrations"],
    satisfied: migrationCheck?.status === "pass",
    blockedByEarlierStep: !steps[1].satisfied,
    reason:
      migrationCheck?.status === "pass"
        ? (migrationCheck.summary ?? "All migrations are applied.")
        : (migrationCheck?.summary ?? "Migration state is unknown."),
  });

  // 4. Environment configuration.
  const envFails = has(envRequiredIds, ["fail"]);
  steps.push({
    id: "environment",
    label: "Environment configuration",
    gatedBy: envRequiredIds,
    satisfied: envFails.length === 0,
    reason:
      envFails.length === 0
        ? "Every required environment variable is set and valid."
        : `${envFails.length} required environment variable(s) are missing or invalid: ${envFails
            .map((id) => id.replace(/^env\./, ""))
            .join(", ")}.`,
  });

  // 5. Security posture.
  const securityGates = ["security.secrets", "security.client-bundle"];
  const securityFails = has(securityGates, ["fail"]);
  steps.push({
    id: "security",
    label: "Security configuration",
    gatedBy: securityGates,
    satisfied: securityFails.length === 0,
    reason:
      securityFails.length === 0
        ? "Secrets are strong and none are exposed to the client bundle."
        : (byId.get(securityFails[0])?.summary ?? "A security requirement is not met."),
  });

  // 6. HTTPS — a real requirement for completing a production installation.
  const httpsCheck = byId.get("network.https");
  const appUrlCheck = byId.get("network.app-url");
  const transportSatisfied =
    httpsCheck?.status !== "fail" && appUrlCheck?.status !== "fail";
  steps.push({
    id: "transport",
    label: "HTTPS and public URL",
    gatedBy: ["network.https", "network.app-url"],
    satisfied: transportSatisfied,
    reason: transportSatisfied
      ? isProduction
        ? "The installer is being used over HTTPS and the configured public URL is consistent."
        : "Acceptable for a non-production environment. HTTPS becomes a hard requirement once NODE_ENV is production."
      : (byId.get("network.https")?.status === "fail"
          ? byId.get("network.https")?.summary
          : byId.get("network.app-url")?.summary) ??
        "The public URL or transport security is not correct for production.",
  });

  // 7. The administrator account.
  const adminCheck = byId.get("security.admin-exists");
  steps.push({
    id: "administrator",
    label: "Administrator account",
    gatedBy: ["security.admin-exists"],
    satisfied: adminCheck?.status === "pass",
    blockedByEarlierStep: !steps[1].satisfied || !steps[2].satisfied,
    reason:
      adminCheck?.status === "pass"
        ? (adminCheck.summary ?? "An administrator exists.")
        : adminCheck?.status === "unknown"
          ? "Whether an administrator exists cannot be determined until the database is reachable."
          : "No SUPER_ADMIN exists yet. Creating the first one is the installer's core purpose — and the only administrator it is ever permitted to create.",
  });

  return steps;
}
