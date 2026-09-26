import type { CheckResult } from "../types";
import type { InstallationLockStatus } from "../state";

/**
 * Web Installer — security posture.
 *
 * These are the checks whose failure means "this deployment is unsafe", as
 * distinct from "this deployment is incomplete". They are kept in their own
 * module so that the set of things this product considers a security
 * requirement is enumerable in one place rather than scattered across the
 * detection engine.
 */

export interface ClientBundleExposureFacts {
  /**
   * Names of environment variables beginning with `NEXT_PUBLIC_` that are
   * currently set. Anything with this prefix is INLINED INTO THE CLIENT
   * BUNDLE by Next.js at build time and is therefore readable by every
   * visitor — including a visitor who is not logged in.
   */
  publicVarNames: string[];
}

/** Substrings that mark a variable name as almost certainly a secret. */
const SECRET_NAME_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /\bPASS\b/i,
  /_PASS$/i,
  /TOKEN/i,
  /_KEY$/i,
  /APIKEY/i,
  /API_KEY/i,
  /CREDENTIAL/i,
  /PRIVATE/i,
  /DATABASE_URL/i,
];

export function findSuspiciousPublicVars(names: string[]): string[] {
  return names.filter(
    (n) => n.startsWith("NEXT_PUBLIC_") && SECRET_NAME_PATTERNS.some((re) => re.test(n))
  );
}

export function evaluateClientBundleExposure(facts: ClientBundleExposureFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "security.client-bundle",
    group: "security",
    label: "Secrets not exposed to the client bundle",
    blocking: true,
  };

  const suspicious = findSuspiciousPublicVars(facts.publicVarNames);

  if (suspicious.length > 0) {
    return {
      ...base,
      status: "fail",
      summary: `${suspicious.length} variable(s) with the NEXT_PUBLIC_ prefix have secret-sounding names: ${suspicious.join(", ")}.`,
      detail:
        "Next.js inlines every NEXT_PUBLIC_* variable into the JavaScript it serves to browsers, at build time. Any value with this prefix is readable by every visitor, logged out or not, by viewing source. If any of these hold a real credential it must be considered compromised, not merely misconfigured.",
      howToFix: [
        "Rename these variables to drop the NEXT_PUBLIC_ prefix so they stay server-side, and update the code that reads them.",
        "Rotate any credential that was ever built into a deployed bundle — it has already been published to everyone who loaded the site.",
        "Rebuild and redeploy: the old value stays baked into the previously-built bundle until it is replaced.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `No secret-looking variables carry the NEXT_PUBLIC_ prefix (${facts.publicVarNames.length} public variable(s) checked).`,
    detail:
      "NEXT_PUBLIC_* values are inlined into the browser bundle by Next.js, so this check exists to catch a credential accidentally given that prefix. It matches on NAMES only — the installer never reads or transmits any variable's value.",
  };
}

export interface AdminPostureFacts {
  /** Total user rows. Null when the database could not be queried. */
  userCount: number | null;
  /** Distinct users holding the SUPER_ADMIN role. Null when unknown. */
  superAdminCount: number | null;
}

export function evaluateAdminExists(facts: AdminPostureFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "security.admin-exists",
    group: "security",
    label: "Administrator account",
    blocking: true,
  };

  if (facts.superAdminCount === null) {
    return {
      ...base,
      status: "unknown",
      summary: "Whether an administrator exists could not be determined — the database was not reachable.",
      howToFix: ["Fix the database connection; this check reports a real answer as soon as the database responds."],
    };
  }

  if (facts.superAdminCount === 0) {
    return {
      ...base,
      status: "fail",
      summary: "No SUPER_ADMIN account exists yet.",
      detail:
        `The platform has ${facts.userCount ?? "an unknown number of"} user account(s) and none of them hold SUPER_ADMIN. ` +
        "Self-registration only ever grants the zero-privilege USER role, so without this step nobody can reach the admin area at all. Creating this first administrator is what the installer is for.",
      howToFix: [
        "Complete the installer's administrator step to create the first SUPER_ADMIN.",
        "This is the only way this installer may create an administrator: it can create the FIRST one, and only while installation is not yet complete.",
      ],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `${facts.superAdminCount} SUPER_ADMIN account(s) exist.`,
    detail:
      "Because an administrator already exists, the installer must not create another one — from here, administrators are managed through the admin area by an existing administrator.",
  };
}

export function evaluateSuperAdminAssigned(facts: AdminPostureFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "security.super-admin",
    group: "security",
    label: "SUPER_ADMIN role assigned",
    blocking: false,
  };

  if (facts.superAdminCount === null || facts.userCount === null) {
    return {
      ...base,
      status: "unknown",
      summary: "Role assignment could not be checked — the database was not reachable.",
      howToFix: ["Fix the database connection and re-run these checks."],
    };
  }

  if (facts.userCount > 0 && facts.superAdminCount === 0) {
    return {
      ...base,
      status: "fail",
      summary: `There are ${facts.userCount} user account(s) but none hold the SUPER_ADMIN role.`,
      detail:
        "Registration grants the zero-privilege USER role only, by design. Existing accounts therefore cannot administer the platform.",
      howToFix: [
        "Create the first SUPER_ADMIN through this installer, then use the admin area to grant roles to the other accounts.",
      ],
    };
  }

  if (facts.superAdminCount === 0) {
    return {
      ...base,
      status: "fail",
      summary: "No account holds the SUPER_ADMIN role.",
      howToFix: ["Create the first administrator through this installer."],
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `SUPER_ADMIN is held by ${facts.superAdminCount} account(s).`,
    detail:
      "The platform enforces that the last SUPER_ADMIN cannot be suspended, demoted or self-deleted, so this cannot fall back to zero through the dashboard.",
  };
}

export function evaluateInstallerLock(
  status: InstallationLockStatus,
  tokenFilePresent: boolean,
  restrictivePermissions: boolean
): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "security.installer-lock",
    group: "security",
    label: "Installer lock",
    blocking: false,
  };

  if (status === "complete") {
    return {
      ...base,
      status: "pass",
      summary: "Installation is complete and the installer is disabled.",
      detail:
        "The lock lives in the database, so it survives redeploys and cannot be cleared from the browser. /install returns a genuine 404 and every installer API refuses.",
      howToFix: [
        "Delete the .install-token file from the project root — it is no longer used for anything and should not linger.",
      ],
    };
  }

  if (status === "unknown") {
    return {
      ...base,
      status: "unknown",
      summary: "Installation state cannot be confirmed because the database is unreachable.",
      detail:
        "An unconfirmed state is deliberately NOT treated as 'not installed' — that would let a brief database outage re-open an unauthenticated administrator-creation endpoint on a live system. Read-only checks continue; nothing can be changed until the database answers.",
      howToFix: [
        "Fix the database connection. Installation state, and the ability to change anything, return as soon as the database responds.",
      ],
    };
  }

  const notes: string[] = [];
  if (!tokenFilePresent) {
    notes.push(
      "No .install-token file is present, so a new token will be generated and printed to the server log on next boot."
    );
  }
  if (!restrictivePermissions) {
    notes.push(
      "The token file's 0600 permission request was not honoured (Windows ignores POSIX modes; production for this product is Linux, where it is honoured)."
    );
  }

  return {
    ...base,
    status: "warn",
    summary: "Installation is NOT complete — /install is reachable to anyone holding the install token.",
    detail:
      "While this is true, the install token is the only thing preventing a stranger who finds this URL from creating the first administrator. Finish the installation promptly and do not leave a half-installed instance exposed to the internet. " +
      notes.join(" "),
    howToFix: [
      "Complete the installation. The lock is written to the database and takes effect immediately for every replica.",
      "Until then, restrict network access to this host if you can (a firewall rule, or a private network).",
      "Retrieve the install token from the server log (`docker logs <container>`) or the .install-token file in the project root. Treat it as a password.",
    ],
  };
}

export interface SecretStrengthFacts {
  jwtSecretLength: number;
  jwtSecretLooksPlaceholder: boolean;
  gscKeyBytes: number | null;
  ga4KeyBytes: number | null;
  googleConfigured: boolean;
}

export function evaluateSecretStrength(facts: SecretStrengthFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "security.secrets",
    group: "security",
    label: "Secret strength",
    blocking: true,
  };

  const problems: string[] = [];
  const fixes: string[] = [];

  if (facts.jwtSecretLength === 0) {
    problems.push("JWT_SECRET is not set");
    fixes.push(
      `Generate JWT_SECRET: \`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"\``
    );
  } else if (facts.jwtSecretLength < 32) {
    problems.push(`JWT_SECRET is only ${facts.jwtSecretLength} characters (32 minimum)`);
    fixes.push("Regenerate JWT_SECRET with at least 32 characters of real entropy.");
  } else if (facts.jwtSecretLooksPlaceholder) {
    problems.push("JWT_SECRET looks like a placeholder rather than a generated value");
    fixes.push("Replace the placeholder JWT_SECRET with a randomly generated secret.");
  }

  if (facts.googleConfigured) {
    if (facts.gscKeyBytes !== 32) {
      problems.push(
        `GSC_TOKEN_ENCRYPTION_KEY decodes to ${facts.gscKeyBytes ?? 0} bytes instead of 32, while Google credentials are configured`
      );
      fixes.push(
        `Generate a 32-byte key: \`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\``
      );
    }
    if (facts.ga4KeyBytes !== 32) {
      problems.push(
        `GA4_TOKEN_ENCRYPTION_KEY decodes to ${facts.ga4KeyBytes ?? 0} bytes instead of 32, while Google credentials are configured`
      );
      fixes.push("Generate a SEPARATE 32-byte key for GA4 — the two keys are deliberately independent.");
    }
  }

  if (problems.length === 0) {
    return {
      ...base,
      status: "pass",
      summary: "JWT_SECRET is strong, and the token-encryption keys required by the configured integrations are valid.",
      detail:
        "Lengths and decoded byte counts were checked. No secret value is displayed, logged or returned anywhere by this installer.",
    };
  }

  return {
    ...base,
    status: "fail",
    summary: `Secret configuration problems: ${problems.join("; ")}.`,
    detail:
      "JWT_SECRET signs session cookies AND the Google OAuth state parameter for both integrations, so a weak value undermines authentication and OAuth CSRF protection at once. " +
      "Rotating the encryption keys later makes every already-stored token permanently undecryptable — there is no key versioning — so fix these before real client connections accumulate, not after.",
    howToFix: [
      ...fixes,
      "Restart the application after changing any of these — process.env is not reloaded while the server runs.",
    ],
  };
}
