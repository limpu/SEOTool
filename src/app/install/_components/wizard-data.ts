import type { InstallStatusReport } from "@/lib/install/checks";
import type { CompletionGate } from "@/lib/install/actions/complete";
import type { WizardModel } from "@/lib/install/wizard-steps";

/**
 * Everything the wizard renders, in one serialisable object.
 *
 * It lives in its own module because both the Server Component that produces
 * it and the client components that consume it import the type, and a
 * type-only import is erased at build time — so this file never drags a
 * server module (`fs`, `pg`, the database client) into the browser bundle.
 *
 * Note what is NOT in here and cannot be: no secret value, no connection
 * string, no install token. `EnvVarReport` has no field that can hold a
 * variable's value, and `CheckResult.summary`/`detail` are sanitized at the
 * point they are created — so there is no field on this object through which
 * a credential could reach the browser.
 */
export interface WizardData {
  report: InstallStatusReport;
  model: WizardModel;
  gate: CompletionGate;
  /** Derived from the deployment's own public URL, for the copy buttons. */
  redirectUris: { gsc: string; ga4: string };
  appUrl: string | null;
}
