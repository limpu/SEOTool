import { NextResponse, type NextRequest } from "next/server";
import {
  isInstallerActionPermitted,
  readInstallationState,
  type InstallationStateSnapshot,
} from "./state";
import { INSTALL_TOKEN_COOKIE, INSTALL_TOKEN_HEADER, verifyInstallToken } from "./token";
import { checkInstallTokenRateLimit, clearInstallTokenRateLimit } from "./rate-limit";

/**
 * Web Installer — the single gate every installer API route passes through.
 *
 * There is exactly ONE implementation of "may this request touch the
 * installer?", and every route calls it. That is deliberate: the failure
 * mode for this kind of guard is not a wrong check, it is a route that
 * forgot to call it. One function, no per-route variations, no optional
 * parameters that can quietly disable a control.
 *
 * The order of operations is itself part of the design:
 *
 *   1. LOCK FIRST, before anything else and before any token work. Once
 *      installation is complete the route is a 404 — an attacker probing a
 *      locked installer learns nothing, not even that the endpoint exists,
 *      and cannot use it as an oracle for anything. Checking the token first
 *      would turn a locked installer into a token-guessing oracle.
 *   2. Rate limit BEFORE verifying, so guesses are metered even when the
 *      guess is wrong (metering only successes would meter nothing).
 *   3. Verify with a constant-time comparison.
 *   4. On success, refund the rate-limit budget so the real operator's
 *      normal use never locks them out — only wrong guesses accumulate.
 */

export type InstallGuardResult =
  | { ok: true; state: InstallationStateSnapshot; degradedRateLimit: boolean }
  | { ok: false; response: NextResponse };

function extractToken(req: NextRequest, bodyToken?: string | null): string | null {
  const header = req.headers.get(INSTALL_TOKEN_HEADER);
  if (header?.trim()) return header.trim();
  const cookie = req.cookies.get(INSTALL_TOKEN_COOKIE)?.value;
  if (cookie?.trim()) return cookie.trim();
  if (bodyToken?.trim()) return bodyToken.trim();
  return null;
}

/**
 * `x-forwarded-for` is used to key the rate limit, matching this codebase's
 * existing `getClientIp()`. Behind a proxy it is the only client identifier
 * available; without one it is spoofable, which would let an attacker rotate
 * the key and evade the limit. That residual weakness is accepted here for
 * the same reason it is accepted on `/api/auth/login`: it is the identifier
 * this deployment shape provides, and the alternative (a global limit) would
 * let one attacker lock out the real operator — a denial of service against
 * the person who is supposed to be installing the product.
 */
function rateLimitKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return `install:${fwd.split(",")[0].trim()}`;
  const real = req.headers.get("x-real-ip");
  if (real) return `install:${real}`;
  return "install:unknown";
}

export async function guardInstallerRequest(
  req: NextRequest,
  options: { capability: "read" | "mutate"; bodyToken?: string | null }
): Promise<InstallGuardResult> {
  // 1 — the lock. Authoritative, server-side, from the database.
  const state = await readInstallationState();
  const permission = isInstallerActionPermitted(state.status, options.capability);

  if (!permission.permitted && permission.httpStatus === 404) {
    // A genuine 404 body. No hint that an installer ever existed here.
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }

  if (!permission.permitted) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: permission.reason },
        { status: permission.httpStatus }
      ),
    };
  }

  // 2 — rate limit the token attempt.
  const key = rateLimitKey(req);
  const rl = await checkInstallTokenRateLimit(key);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Too many install-token attempts. The installer is locked for a short period to prevent the token being guessed.",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        {
          status: 429,
          headers: rl.retryAfterSeconds
            ? { "Retry-After": String(rl.retryAfterSeconds) }
            : undefined,
        }
      ),
    };
  }

  // 3 — verify, constant-time, against the token file.
  const candidate = extractToken(req, options.bodyToken);
  const valid = await verifyInstallToken(candidate);
  if (!valid) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          // One message for "no token", "wrong token" and "no token file
          // exists" — distinguishing them tells a prober which of those
          // three situations they are in, and none of that is their business.
          error:
            "A valid install token is required. It is printed in the server log at startup and stored in .install-token in the project root.",
        },
        { status: 401 }
      ),
    };
  }

  // 4 — refund the budget for a correct token.
  await clearInstallTokenRateLimit(key);

  return { ok: true, state, degradedRateLimit: rl.degraded };
}
