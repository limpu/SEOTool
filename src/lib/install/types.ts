/**
 * Web Installer — Stage 1 (security model + read-only detection engine).
 *
 * Shared result shape for every check in `src/lib/install/checks/`. The
 * contract is deliberately narrow so the Stage 2 wizard UI can render ANY
 * check without knowing what it measures, and so a new check can be added
 * without touching the API route or the UI.
 *
 * Status meanings (these are product statements, not cosmetic labels):
 *   pass     — measured, and the measured value meets the baseline.
 *   warn     — measured, below the RECOMMENDED baseline but not blocking.
 *              A warn must never be upgraded to a hard block: this product
 *              runs on modest hardware and telling an operator "you may not
 *              install" over 3 GB of RAM would be a lie about what is
 *              actually required.
 *   fail     — measured, and the platform genuinely cannot work like this.
 *   optional — the feature this check covers is not configured, and that is
 *              a legitimate, supported state (Section 79 #3 / the existing
 *              "honest not-configured" pattern used by GSC / GA4 / Ollama).
 *              `optional` is NEVER a disguised failure.
 *   unknown  — we could not measure it. Deliberately distinct from `fail`:
 *              "we could not check" and "we checked and it is broken" are
 *              different facts and must never be collapsed (Section 77).
 */
export type CheckStatus = "pass" | "warn" | "fail" | "optional" | "unknown";

export type CheckGroup =
  | "runtime"
  | "database"
  | "environment"
  | "security"
  | "network"
  | "resources"
  | "integrations"
  | "deployment"
  | "health";

export interface CheckResult {
  /** Stable machine id, e.g. `database.reachable`. Never localise this. */
  id: string;
  group: CheckGroup;
  /** Human label for the wizard UI. */
  label: string;
  status: CheckStatus;
  /** One line. Must already be sanitized — no secrets, no stack traces. */
  summary: string;
  /** Optional longer explanation. Must already be sanitized. */
  detail?: string;
  /**
   * Actionable remediation steps. MANDATORY whenever `status` is `fail`
   * (and strongly expected on `warn`/`unknown`): the user must never be
   * shown a bare technical error with no way forward. `assertActionable()`
   * in `./checks/index.ts` enforces this at runtime.
   */
  howToFix?: string[];
  /**
   * True when a `fail` on this check must prevent the installation from
   * being marked complete. A `warn` never blocks regardless of this flag.
   */
  blocking?: boolean;
}

/** Environment-variable classification. Presence alone is NOT validity. */
export type EnvClassification =
  | "missing" // not set at all, and it matters
  | "invalid" // set, but the value cannot work (wrong shape / wrong for this env)
  | "configured" // set and structurally valid — but not proven to work
  | "verified" // set AND independently proven to work this run
  | "optional"; // not set, and that is a supported state

export interface EnvVarReport {
  name: string;
  classification: EnvClassification;
  /** Why this classification. Never contains the value itself. */
  reason: string;
  /** Which feature stops working if this is missing/invalid. */
  feature: string;
  /** True when this variable is a secret and must never be echoed anywhere. */
  secret: boolean;
  howToFix?: string[];
}

/** Context a check may need about the incoming request / target environment. */
export interface CheckContext {
  /** Effective protocol of the request that triggered the check, if known. */
  requestProtocol?: "http" | "https";
  /** Host header of the request that triggered the check, if known. */
  requestHost?: string;
  /**
   * Connection string to test, when the operator is supplying a NEW one in
   * the wizard rather than testing the already-configured `DATABASE_URL`.
   * Never logged, never echoed back.
   */
  databaseUrlOverride?: string;
  /** Absolute path to the project root (for migration discovery). */
  projectRoot?: string;
  /** Treat the target as production regardless of NODE_ENV. */
  assumeProduction?: boolean;
}
