import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { installationState } from "@/lib/db/schema";
import { sanitizeError } from "./redact";

/**
 * Web Installer — reading and writing the durable installation lock.
 *
 * ─── THE THREE-VALUED ANSWER, AND WHY IT IS NOT TWO-VALUED ──────────────
 * "Is this platform installed?" has three honest answers, not two:
 *
 *   complete      — the database says yes. Authoritative.
 *   not_complete  — the database says no. Authoritative.
 *   unknown       — the database could not be asked.
 *
 * Collapsing `unknown` into `not_complete` is the single most dangerous
 * mistake available in this module. A live, fully-installed production
 * system whose database briefly goes away would, under that collapse,
 * re-open `/install` — an unauthenticated admin-creation endpoint — at
 * exactly the moment the system is least healthy and least watched. An
 * attacker who can cause a momentary database outage (or simply wait for
 * one) would get a free administrator account. So `unknown` is its own
 * state and is NEVER treated as "not installed".
 *
 * ─── WHAT `unknown` IS ALLOWED TO DO ────────────────────────────────────
 * It cannot simply refuse everything either: repairing a broken
 * `DATABASE_URL` is one of the installer's primary jobs, and an installer
 * that goes dark the moment the database is unreachable is useless for the
 * one problem it most needs to solve. The resolution is a split by
 * capability, not by route:
 *
 *   - READ-ONLY DIAGNOSTICS are permitted while `unknown` — and still only
 *     to a caller holding a valid install token. Worst case, an operator
 *     with filesystem/log access learns their database is down. That is not
 *     a privilege escalation; it is the thing they came for.
 *   - ANYTHING THAT MUTATES, and above all COMPLETING THE INSTALLATION or
 *     CREATING THE FIRST SUPER_ADMIN, requires an authoritative
 *     `not_complete`. `unknown` fails closed. (Structurally guaranteed
 *     besides: writing the completion row requires the same database that
 *     is unreachable, so it cannot succeed anyway — but the check is
 *     explicit rather than incidental, so a future code path cannot quietly
 *     acquire the ability.)
 *
 * ─── SECOND, INDEPENDENT SAFETY NET ─────────────────────────────────────
 * `assertMayCreateFirstSuperAdmin()` additionally requires that ZERO
 * SUPER_ADMINs currently exist. Even in a state where the lock somehow read
 * `not_complete` on a live system, the installer still could not mint an
 * administrator alongside existing ones — so the installer can never become
 * an authentication bypass for an already-running platform.
 */

export type InstallationLockStatus = "complete" | "not_complete" | "unknown";

export interface InstallStepRecord {
  status: string;
  at: string;
}

export interface InstallationStateSnapshot {
  status: InstallationLockStatus;
  completed: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
  steps: Record<string, InstallStepRecord>;
  /** Sanitized explanation, present only when `status === "unknown"`. */
  reason?: string;
  /**
   * True when the schema itself is missing (`installation_state` does not
   * exist). This is a genuine "migrations have not been applied yet" signal
   * and is materially different from "the database is unreachable" — the
   * former is a fresh, correctly-empty database and IS safe to treat as
   * not-installed; the latter is not.
   */
  schemaMissing?: boolean;
}

/** Postgres SQLSTATE for `undefined_table` — i.e. migrations not applied yet. */
const UNDEFINED_TABLE = "42P01";
/** `invalid_schema_name` — same meaning for our purposes. */
const INVALID_SCHEMA = "3F000";

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code ?? e?.cause?.code;
}

/**
 * Read the installation lock.
 *
 * Never throws. Every failure becomes a well-formed `unknown` (or, for the
 * specific and unambiguous "the table does not exist" case, a `not_complete`
 * with `schemaMissing: true` — a database that is reachable and demonstrably
 * has no installer schema is a fresh database, which is precisely the
 * situation the installer is for).
 */
export async function readInstallationState(): Promise<InstallationStateSnapshot> {
  try {
    const rows = await db
      .select()
      .from(installationState)
      .where(eq(installationState.id, 1))
      .limit(1);

    const row = rows[0];
    if (!row) {
      // Table exists but the singleton is absent. The migration seeds it, so
      // this means someone deleted the row. Treated as not-complete (the
      // database IS reachable and is authoritatively telling us there is no
      // completion record) but flagged, because it is an anomaly worth
      // surfacing to the operator rather than silently normalising.
      return {
        status: "not_complete",
        completed: false,
        completedAt: null,
        completedByUserId: null,
        steps: {},
        reason: "The installation_state row is missing; treating the platform as not installed.",
      };
    }

    return {
      status: row.completed ? "complete" : "not_complete",
      completed: row.completed,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      completedByUserId: row.completedByUserId ?? null,
      steps: (row.steps ?? {}) as Record<string, InstallStepRecord>,
    };
  } catch (err) {
    const code = pgCode(err);
    if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA) {
      return {
        status: "not_complete",
        completed: false,
        completedAt: null,
        completedByUserId: null,
        steps: {},
        schemaMissing: true,
        reason:
          "The database is reachable but the installer schema is not present — migrations have not been applied yet.",
      };
    }
    return {
      status: "unknown",
      completed: false,
      completedAt: null,
      completedByUserId: null,
      steps: {},
      reason: sanitizeError(err),
    };
  }
}

/**
 * Pure decision function, extracted from the I/O above so the policy itself
 * is directly unit-testable (the same "extract the decision" pattern used by
 * `isLastSuperAdmin` in `src/lib/rbac/super-admin-guard.ts`).
 *
 * `capability` is what the caller wants to do, NOT which route they are on —
 * this is why an unreachable database can still serve diagnostics without
 * that also granting the ability to mint an administrator.
 */
export function isInstallerActionPermitted(
  status: InstallationLockStatus,
  capability: "read" | "mutate"
): { permitted: boolean; httpStatus: number; reason: string } {
  if (status === "complete") {
    return {
      permitted: false,
      // A real 404. Once locked, the installer does not exist as far as the
      // network is concerned — a 403 would confirm to a scanner that this
      // deployment HAS an installer, which is information an attacker can
      // use to wait for a downgrade, a restore-from-backup, or a redeploy.
      httpStatus: 404,
      reason: "Installation is already complete.",
    };
  }
  if (status === "unknown") {
    if (capability === "read") {
      return {
        permitted: true,
        httpStatus: 200,
        reason:
          "The database is unreachable, so installation state cannot be confirmed. Read-only checks are still available so the connection problem can be diagnosed; nothing can be changed until the database responds.",
      };
    }
    return {
      permitted: false,
      httpStatus: 503,
      reason:
        "The database is unreachable, so installation state cannot be confirmed. Changes are refused while the state is unknown — an unconfirmed state is never treated as 'not installed'.",
    };
  }
  return { permitted: true, httpStatus: 200, reason: "Installation is not complete." };
}

/**
 * Ensure the singleton row exists. The migration already seeds it; this
 * covers a database whose row was deleted by hand. Idempotent.
 */
export async function ensureInstallationStateRow(tokenFingerprint?: string): Promise<void> {
  await db
    .insert(installationState)
    .values({ id: 1, completed: false, tokenFingerprint: tokenFingerprint ?? null })
    .onConflictDoNothing({ target: installationState.id });

  if (tokenFingerprint) {
    // Correlation only — this value is a non-reversible hash prefix, never a
    // credential, and is not what token verification compares against.
    await db
      .update(installationState)
      .set({ tokenFingerprint, updatedAt: new Date() })
      .where(eq(installationState.id, 1));
  }
}

/**
 * Record per-step progress so a partially-finished installation is resumable
 * and each step is idempotent.
 *
 * Stage 1 exposes NO API route that calls this — Stage 1 is read-only by
 * design. It lives here now because step state is part of the state model
 * this stage is responsible for defining, and because the state-transition
 * tests exercise it directly.
 */
export async function recordInstallStep(
  stepId: string,
  status: "pending" | "complete" | "skipped" | "failed"
): Promise<void> {
  const snapshot = await readInstallationState();
  if (snapshot.status !== "not_complete") {
    throw new Error("Installation steps cannot be recorded unless the installer is open.");
  }
  const next: Record<string, InstallStepRecord> = {
    ...snapshot.steps,
    [stepId]: { status, at: new Date().toISOString() },
  };
  await db
    .update(installationState)
    .set({ steps: next, updatedAt: new Date() })
    .where(eq(installationState.id, 1));
}

/**
 * Close the lock. Once this returns, `/install` is dead for this database.
 *
 * Guarded three ways:
 *   1. requires an authoritative `not_complete` (never `unknown`);
 *   2. the UPDATE is itself conditional on `completed = false`, so two
 *      concurrent requests cannot both believe they completed the install —
 *      the database, not application ordering, decides the winner;
 *   3. returns false rather than throwing when it loses that race, so the
 *      caller reports "already complete" instead of a 500.
 *
 * Stage 1 exposes no route that calls this. Stage 2 will, behind the same
 * token check plus the HTTPS-in-production requirement.
 */
export async function markInstallationComplete(completedByUserId: string): Promise<boolean> {
  const snapshot = await readInstallationState();
  if (snapshot.status !== "not_complete") return false;

  const updated = await db
    .update(installationState)
    .set({
      completed: true,
      completedAt: new Date(),
      completedByUserId,
      updatedAt: new Date(),
    })
    .where(sql`${installationState.id} = 1 AND ${installationState.completed} = false`)
    .returning({ id: installationState.id });

  return updated.length === 1;
}
