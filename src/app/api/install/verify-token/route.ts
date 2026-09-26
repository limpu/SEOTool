import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guardInstallerRequest } from "@/lib/install/guard";
import { INSTALL_TOKEN_COOKIE } from "@/lib/install/token";
import { sanitizeError } from "@/lib/install/redact";

/**
 * Web Installer — POST /api/install/verify-token
 *
 * The one endpoint that accepts a token in the request BODY, so the Stage 2
 * wizard has somewhere to submit the token the operator pastes in. On
 * success it sets an httpOnly cookie so subsequent installer requests carry
 * the token automatically, and the token never has to live in JavaScript.
 *
 * The cookie is a CONVENIENCE, not a second authority. Every installer route
 * re-verifies the token value on every request against the file on disk —
 * possessing the cookie is exactly as strong as possessing the token,
 * because the cookie IS the token. Deleting it logs you out of the wizard;
 * it cannot open a locked installer, because the lock lives in the database
 * and is checked before the cookie is even read.
 *
 * Rate limiting lives in `guardInstallerRequest`, so it applies to this route
 * identically to every other — there is no path to a token check that skips
 * the limiter.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);

    // A malformed body is fed to the guard as "no token" rather than
    // short-circuiting to 400. Otherwise an attacker could probe the
    // installer with malformed bodies without ever consuming rate-limit
    // budget, and the limiter would be trivially bypassable.
    const guard = await guardInstallerRequest(req, {
      capability: "read",
      bodyToken: parsed.success ? parsed.data.token : null,
    });
    if (!guard.ok) return guard.response;

    const response = NextResponse.json(
      {
        valid: true,
        installation: {
          status: guard.state.status,
          completed: guard.state.completed,
        },
        rateLimitDegraded: guard.degradedRateLimit,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

    if (parsed.success) {
      response.cookies.set({
        name: INSTALL_TOKEN_COOKIE,
        value: parsed.data.token.trim(),
        httpOnly: true, // never readable by page JavaScript
        sameSite: "lax",
        // Secure whenever the request itself arrived over TLS. Not hard-coded
        // to true: an operator installing over plain HTTP on a private
        // network would otherwise get a cookie the browser silently drops,
        // and would be told "invalid token" forever with no explanation.
        secure: (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https",
        path: "/",
        maxAge: 60 * 60 * 4, // 4 hours — an installation session, not a login
      });
    }

    return response;
  } catch (err) {
    console.error("[install/verify-token]", sanitizeError(err));
    return NextResponse.json(
      { error: "The install token could not be verified. See the server log for details." },
      { status: 500 }
    );
  }
}
