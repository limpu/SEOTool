import fs from "fs/promises";
import { markInstallationComplete } from "../state";
import { getInstallTokenPath } from "../token";
import { sanitizeError } from "../redact";
import type { CheckResult } from "../types";
import type { InstallStatusReport } from "../checks";

/**
 * Web Installer — Stage 2. Completing the installation.
 *
 * This is the one irreversible action in the whole installer. After it,
 * `/install` returns 404 for this database — for the operator as much as for
 * an attacker — and the only way back is a deliberate database edit. So it
 * is gated on measurements rather than on the wizard's own sense of progress,
 * and the gate is a pure function so the policy is testable on its own.
 *
 * ─── WHAT "MANDATORY" MEANS ─────────────────────────────────────────────
 * A check blocks completion only when it is a `fail` AND carries
 * `blocking: true`. That distinction is Stage 1's and it is load-bearing:
 *
 *   - `warn` NEVER blocks. Below-recommended RAM, no Chromium, a missing
 *     optional integration — refusing to complete over any of those would
 *     assert a requirement this product does not have, and would leave the
 *     operator with a permanently open unauthenticated installer as the
 *     price of a 2 GB VPS.
 *   - `optional` never blocks, by definition.
 *   - `unknown` never blocks either, because "we could not measure it" is not
 *     evidence of a problem — with one exception below.
 *
 * ─── THE THREE THINGS THAT DO BLOCK ─────────────────────────────────────
 * 1. Any blocking `fail` — a missing required env var, an unreachable
 *    database, pending migrations.
 * 2. NO ADMINISTRATOR. Completing without one produces a platform nobody can
 *    ever sign in to, with the installer permanently closed. That is an
 *    unrecoverable state reached by clicking a button, so it is refused
 *    outright — including when the administrator count is `unknown`, the one
 *    place an unknown must fail closed.
 * 3. PLAIN HTTP IN PRODUCTION. Two concrete reasons, not a principle: the
 *    administrator's password would have crossed the network in clear text,
 *    and the session cookie is issued `secure: true` in production, so nobody
 *    could stay signed in even if they got the password there safely.
 */

export interface CompletionGate {
  allowed: boolean;
  /** Checks that must be fixed first. Each carries its own howToFix already. */
  blockers: CheckResult[];
  /** Non-blocking problems worth showing before the point of no return. */
  warnings: CheckResult[];
  reason: string;
  /** Stated every time — this is irreversible. */
  consequences: string[];
}

export const COMPLETION_CONSEQUENCES = [
  "The installer is permanently disabled for this database. /install will return 404 — not a message saying installation is finished, a genuine 404, so a scanner cannot even learn that an installer ever existed here.",
  "The .install-token file is deleted. Restarting the application will not generate a new one while the installation is marked complete.",
  "Reopening the installer would require editing the installation_state row in the database by hand. There is no button for it, deliberately.",
  "Nothing else changes: your data, your administrator account and your configuration are untouched. Only the installer closes.",
];

/**
 * Pure gate. Takes the live report and answers "may this be completed?".
 */
export function evaluateCompletionGate(report: InstallStatusReport): CompletionGate {
  const blockers: CheckResult[] = [];

  for (const c of report.checks) {
    if (c.status === "fail" && c.blocking) blockers.push(c);
  }

  const admin = report.checks.find((c) => c.id === "security.admin-exists");
  if (admin && admin.status !== "pass" && !blockers.includes(admin)) {
    blockers.push({
      ...admin,
      howToFix:
        admin.status === "unknown"
          ? [
              "The database could not be read, so whether an administrator exists is unknown. Completing on an unknown is refused: if it turned out there is none, the platform would be permanently unreachable with the installer closed.",
              "Fix the database connection and re-run the checks.",
            ]
          : [
              "Create the administrator account in the Administrator step above.",
              "Completing without one would leave a platform that nobody can ever sign in to, and the installer would already be closed — there is no recovery from that except editing the database by hand.",
            ],
    });
  }

  const https = report.checks.find((c) => c.id === "network.https");
  if (report.isProduction && https?.status === "fail" && !blockers.includes(https)) {
    blockers.push(https);
  }

  if (report.installation.status !== "not_complete") {
    blockers.push({
      id: "installation.state",
      group: "database",
      label: "Installation state",
      status: report.installation.status === "complete" ? "fail" : "unknown",
      summary:
        report.installation.status === "complete"
          ? "This installation is already marked complete."
          : "The installation state could not be read from the database, so it cannot be changed.",
      howToFix: [
        "Completing requires an authoritative 'not complete' answer from the database. An unconfirmed state is never treated as 'not installed'.",
        "Fix the database connection and re-run the checks.",
      ],
      blocking: true,
    });
  }

  const warnings = report.checks.filter(
    (c) => (c.status === "warn" || c.status === "unknown") && !blockers.includes(c)
  );

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    reason:
      blockers.length === 0
        ? "Every mandatory check passes. The installation can be completed."
        : `${blockers.length} mandatory requirement(s) are not met. Each one is listed with what is wrong, why it matters and how to fix it.`,
    consequences: COMPLETION_CONSEQUENCES,
  };
}

export type CompletionResult =
  | {
      ok: true;
      completedByUserId: string;
      tokenFileRemoved: boolean;
      message: string;
      notes: string[];
    }
  | { ok: false; httpStatus: number; message: string; blockers?: CheckResult[]; howToFix: string[] };

/**
 * Close the installer.
 *
 * Order is deliberate: the DATABASE LOCK IS WRITTEN FIRST, and the token file
 * is deleted only afterwards. The reverse order has a real failure mode —
 * delete the token, fail to write the lock, and the operator is locked out of
 * an installer that is still open to anyone who can read the log line the
 * token was printed on. `markInstallationComplete` is itself a conditional
 * UPDATE, so a second concurrent request loses cleanly rather than both
 * believing they won.
 *
 * Failing to delete the token file is reported, never hidden — but it does not
 * fail the completion, because the lock is what actually closes the installer
 * and it is already written. A leftover token file opens nothing.
 */
export async function completeInstallation(opts: {
  userId: string;
  projectRoot: string;
}): Promise<CompletionResult> {
  const locked = await markInstallationComplete(opts.userId);
  if (!locked) {
    return {
      ok: false,
      httpStatus: 409,
      message:
        "The installation could not be marked complete — the database reports it is either already complete or in a state that cannot be changed.",
      howToFix: [
        "Reload the installer. If installation is already complete, /install will return 404, which is the expected behaviour.",
      ],
    };
  }

  let tokenFileRemoved = false;
  let tokenNote =
    "The .install-token file was deleted. Even if it had not been, it would open nothing: the lock lives in the database and is checked before the token.";
  try {
    await fs.unlink(getInstallTokenPath(opts.projectRoot));
    tokenFileRemoved = true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      tokenFileRemoved = true;
      tokenNote = "There was no .install-token file left to delete.";
    } else {
      tokenNote = `The installation is locked, but the .install-token file could not be deleted (${sanitizeError(err)}). This does not reopen anything — the lock is in the database — but delete the file by hand to keep the project directory clean.`;
    }
  }

  return {
    ok: true,
    completedByUserId: opts.userId,
    tokenFileRemoved,
    message:
      "Installation complete. The installer is now closed for this database and /install returns 404.",
    notes: [
      tokenNote,
      "Sign in with the administrator account you created. Its email is shown on this screen; its password is not, and cannot be — nothing stored it.",
      "Connect Search Console and Google Analytics from inside the application when you are ready. Those are explicit user actions and were deliberately never performed by the installer.",
    ],
  };
}
