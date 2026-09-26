import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { guardInstallerRequest } from "../guard";
import type { InstallationStateSnapshot } from "../state";
import { sanitizeError } from "../redact";

/**
 * Web Installer — Stage 2. The one wrapper every mutation route uses.
 *
 * Stage 1's note applies with more force now that routes can actually change
 * things: the failure mode for a guard is not a wrong check, it is a route
 * that forgot to call it. So there is exactly one wrapper, every mutating
 * route is written as a handler passed to it, and no route gets its own
 * variation of the guard chain.
 *
 * What the wrapper guarantees for every route it wraps:
 *
 *   1. `guardInstallerRequest(..., { capability: "mutate" })` runs FIRST.
 *      That gives, in Stage 1's order: the database lock before anything else
 *      (404 once complete, so a locked installer is not even an oracle), then
 *      the rate limit, then the timing-safe token comparison, then the refund
 *      on a correct token. `capability: "mutate"` is what makes an `unknown`
 *      installation state fail CLOSED with 503 rather than being treated as
 *      "not installed".
 *   2. A malformed JSON body never short-circuits the guard. It is parsed to
 *      `null` and the guard still runs, so junk bodies consume rate-limit
 *      budget exactly like any other wrong guess (Stage 1's rule, kept).
 *   3. NOTHING UNSANITIZED LEAVES. Every thrown error is reduced by
 *      `sanitizeError` — `error.message` only, never `error.stack`, never the
 *      serialised error object — and the response body is a fixed sentence
 *      that points at the server log rather than carrying the cause, because
 *      an internal error here can contain a connection string.
 *   4. `no-store` and `X-Robots-Tag: noindex` on every response.
 */

export interface InstallMutationContext<TBody> {
  body: TBody;
  state: InstallationStateSnapshot;
  req: NextRequest;
  projectRoot: string;
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function installerJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: SECURITY_HEADERS });
}

/**
 * Wrap a mutating installer handler.
 *
 * `schema` is applied AFTER the guard, never before: validating first would
 * let an unauthenticated caller distinguish "your body is wrong" from "your
 * token is wrong", which tells a prober the endpoint exists and what it
 * expects. A caller without a valid token learns nothing but 401.
 */
export async function withInstallerMutation<TBody>(
  req: NextRequest,
  schema: ZodType<TBody>,
  handler: (ctx: InstallMutationContext<TBody>) => Promise<NextResponse>,
  routeLabel: string
): Promise<NextResponse> {
  try {
    const raw = await req.json().catch(() => null);

    const guard = await guardInstallerRequest(req, {
      capability: "mutate",
      bodyToken:
        raw && typeof raw === "object" && typeof (raw as { token?: unknown }).token === "string"
          ? ((raw as { token: string }).token)
          : null,
    });
    if (!guard.ok) return guard.response;

    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const firstError =
        Object.values(fieldErrors).find((v) => v && v.length > 0)?.[0] ??
        parsed.error.flatten().formErrors[0] ??
        "The information supplied was not valid.";
      return installerJson(
        {
          error: firstError,
          // Field-level messages so the wizard can point at the offending
          // input rather than showing one message above the whole form.
          fieldErrors,
        },
        400
      );
    }

    return await handler({
      body: parsed.data,
      state: guard.state,
      req,
      projectRoot: process.cwd(),
    });
  } catch (err) {
    // Sanitized before it reaches even the server log — this project's own
    // log is not a safe place for a connection string either.
    console.error(`[install/${routeLabel}]`, sanitizeError(err));
    return installerJson(
      {
        error:
          "The installer could not complete this action. The underlying cause is in the application's server log and is deliberately not returned here, because internal errors can contain configuration secrets.",
      },
      500
    );
  }
}
