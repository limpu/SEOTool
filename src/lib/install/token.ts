import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

/**
 * Web Installer — the install token (proof-of-operator).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────
 * An `/install` route that can create the first SUPER_ADMIN is, until it is
 * locked, an UNAUTHENTICATED REMOTE ADMIN-CREATION ENDPOINT. The classic
 * failure is the WordPress-install race: an attacker scanning freshly
 * deployed hosts for `/install` reaches it before the owner does, completes
 * the wizard, and owns the platform — with no vulnerability in any single
 * line of code, purely because "no admin exists yet" was treated as
 * sufficient protection. It is not. "No admin exists yet" is the attacker's
 * opportunity, not the defence.
 *
 * The defence is a capability the operator has and a passer-by does not:
 * possession of a secret that only exists on the server's filesystem and in
 * the server's own stdout. Holding the install token proves the requester
 * can read the container's logs (`docker logs`) or the project directory —
 * i.e. proves they are the person who deployed this instance. Nothing about
 * reaching the URL proves that.
 *
 * ─── PROPERTIES ─────────────────────────────────────────────────────────
 * - 32 random bytes from `crypto.randomBytes` (base64url ⇒ 43 chars).
 *   Not `Math.random`, not a timestamp, not a uuid.
 * - Generated ONCE per installation and persisted, so a process restart
 *   does not invalidate a token the operator already copied.
 * - File written with mode 0o600. On Windows POSIX modes are ignored by the
 *   OS — that is accepted and documented rather than papered over; the
 *   production target for this product is Linux (see the Dockerfile), and on
 *   Windows the file still sits inside the project directory under the
 *   developer's own user account.
 * - Logged to stdout exactly once per process, because in a container the
 *   file is not reachable from outside and `docker logs` is the operator's
 *   only retrieval path.
 * - Compared with `crypto.timingSafeEqual`, guarded on length first
 *   (`timingSafeEqual` THROWS on unequal-length buffers rather than
 *   returning false).
 *
 * ─── DELIBERATELY NOT DB-BACKED ─────────────────────────────────────────
 * Token verification never touches the database. One of the installer's core
 * jobs is diagnosing a broken `DATABASE_URL`; a token that could only be
 * checked against the database would be unusable in exactly the situation
 * the installer exists for. The DATABASE is authoritative for the LOCK
 * (`./state.ts`); the FILE is authoritative for the TOKEN. Those are two
 * different questions and they fail independently on purpose.
 */

export const INSTALL_TOKEN_FILENAME = ".install-token";
export const INSTALL_TOKEN_BYTES = 32;
/** Header the installer API reads the token from. */
export const INSTALL_TOKEN_HEADER = "x-install-token";
/** Cookie the Stage 2 wizard will use so the token is sent on every step. */
export const INSTALL_TOKEN_COOKIE = "install_token";

export function getInstallTokenPath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, INSTALL_TOKEN_FILENAME);
}

/** 32 cryptographically random bytes, base64url encoded (43 chars). */
export function generateInstallToken(): string {
  return crypto.randomBytes(INSTALL_TOKEN_BYTES).toString("base64url");
}

/**
 * A short, NON-reversible identifier for a token, safe to write to the
 * database or a log line for correlation ("the token in use is a1b2c3d4").
 * Never sufficient to reconstruct the token.
 */
export function tokenFingerprint(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex").slice(0, 12);
}

/**
 * Constant-time string comparison.
 *
 * The length guard is REQUIRED, not defensive tidiness: `timingSafeEqual`
 * throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on unequal-length buffers,
 * so an attacker submitting a short token would otherwise produce a 500
 * instead of a clean rejection. Returning `false` on a length mismatch
 * leaks only the token's length, which is a fixed, public constant of this
 * implementation (43 characters) and therefore not a secret.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  if (ab.length === 0) return false; // an empty token is never valid
  return crypto.timingSafeEqual(ab, bb);
}

/** Read the persisted token, or null when there is no token file. */
export async function readInstallTokenFromDisk(
  projectRoot: string = process.cwd()
): Promise<string | null> {
  try {
    const raw = await fs.readFile(getInstallTokenPath(projectRoot), "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    // Missing / unreadable is a normal state (first boot, or an operator
    // who deleted it). Never surface the underlying fs error — it contains
    // an absolute path.
    return null;
  }
}

export interface EnsureTokenResult {
  token: string;
  /** True when this call generated a brand-new token. */
  created: boolean;
  fingerprint: string;
  /** True when the 0o600 mode request was accepted by the OS. */
  restrictivePermissions: boolean;
}

let loggedFingerprintThisProcess: string | null = null;

/**
 * Return the existing install token, generating and persisting one if none
 * exists. Idempotent: calling this on every installer request is correct and
 * cheap, and it never rotates a token an operator may already have copied.
 *
 * On regeneration (file absent) it logs the token once. That is intentional
 * for containers, where `/app/.install-token` is ephemeral — it disappears
 * on every redeploy, so the log line is the ONLY retrieval path there. The
 * alternative (refusing to regenerate once a fingerprint is recorded) would
 * permanently brick a container operator whose container simply restarted,
 * which is a far more likely event than an attacker who can delete a file
 * inside the container but cannot read it.
 */
export async function ensureInstallToken(
  projectRoot: string = process.cwd()
): Promise<EnsureTokenResult> {
  const existing = await readInstallTokenFromDisk(projectRoot);
  if (existing) {
    const fingerprint = tokenFingerprint(existing);
    logTokenOnce(existing, fingerprint, false);
    return { token: existing, created: false, fingerprint, restrictivePermissions: true };
  }

  const token = generateInstallToken();
  const fingerprint = tokenFingerprint(token);
  let restrictivePermissions = true;
  try {
    await fs.writeFile(getInstallTokenPath(projectRoot), `${token}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    if (process.platform === "win32") {
      // Windows ignores POSIX modes entirely. Report honestly rather than
      // claiming a protection that was not applied (Section 77).
      restrictivePermissions = false;
    }
  } catch {
    // A read-only filesystem is a real deployment shape. The token still
    // works for this process lifetime via the log line below; it just will
    // not survive a restart. Reported, never silently swallowed.
    restrictivePermissions = false;
  }

  logTokenOnce(token, fingerprint, true);
  return { token, created: true, fingerprint, restrictivePermissions };
}

function logTokenOnce(token: string, fingerprint: string, created: boolean) {
  if (loggedFingerprintThisProcess === fingerprint) return;
  loggedFingerprintThisProcess = fingerprint;
  // Written to stdout on purpose — see the module header. This is the only
  // place in the entire codebase that deliberately logs a secret, and it is
  // sound because the secret's whole purpose is to prove the reader has
  // exactly this access.
  console.log(
    [
      "",
      "──────────────────────────────────────────────────────────────",
      ` AI SEO Platform — installation is NOT complete.`,
      ` ${created ? "Generated a new" : "Using the existing"} install token (fingerprint ${fingerprint}).`,
      "",
      ` Install token: ${token}`,
      "",
      ` Open /install and paste this token to continue.`,
      ` It is also stored in ${INSTALL_TOKEN_FILENAME} in the project root (mode 0600 on Linux).`,
      ` Anyone holding this token can create the first administrator — treat it as a password.`,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );
}

/**
 * Verify a candidate token against the persisted one.
 *
 * Returns false — never throws — for every failure mode (no token file,
 * empty candidate, wrong length, wrong value), so callers cannot
 * accidentally distinguish them from each other via an exception.
 */
export async function verifyInstallToken(
  candidate: string | null | undefined,
  projectRoot: string = process.cwd()
): Promise<boolean> {
  if (!candidate) return false;
  const actual = await readInstallTokenFromDisk(projectRoot);
  if (!actual) return false;
  return timingSafeEqualStrings(candidate.trim(), actual);
}

/** Test-only: allow the "log exactly once" guard to be re-armed. */
export function __resetTokenLogGuardForTests() {
  loggedFingerprintThisProcess = null;
}
