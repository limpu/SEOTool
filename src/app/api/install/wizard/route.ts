import { NextResponse, type NextRequest } from "next/server";
import { guardInstallerRequest } from "@/lib/install/guard";
import { runAllChecks } from "@/lib/install/checks";
import { resolveRequestProtocol } from "@/lib/install/checks/network";
import { evaluateCompletionGate } from "@/lib/install/actions/complete";
import { deriveWizardModel } from "@/lib/install/wizard-steps";
import { expectedRedirectUris } from "@/lib/install/actions/google";
import { sanitizeError } from "@/lib/install/redact";

/**
 * Web Installer — GET /api/install/wizard
 *
 * The same read-only detection engine as `/api/install/status`, plus the two
 * derivations the wizard needs: the section model and the completion gate.
 *
 * It exists as its own route rather than being computed in the browser for
 * one reason: `evaluateCompletionGate` is the policy the completion endpoint
 * ENFORCES, and the UI must render that exact decision rather than hold a
 * second copy of it that can drift. Deriving it server-side means there is
 * one implementation of "may this be completed", and the screen and the API
 * cannot disagree.
 *
 * READ capability, so it still answers while the database is unreachable —
 * diagnosing that is the installer's job — and 404s once installation is
 * complete, like everything else.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = await guardInstallerRequest(req, { capability: "read" });
    if (!guard.ok) return guard.response;

    const { protocol } = resolveRequestProtocol(req.headers);
    const host = req.headers.get("host");
    const report = await runAllChecks({
      requestProtocol: protocol,
      requestHost: host ?? undefined,
      projectRoot: process.cwd(),
    });

    const gate = evaluateCompletionGate(report);
    const model = deriveWizardModel(report, gate.allowed);

    return NextResponse.json(
      {
        report,
        model,
        gate,
        // Derived from the deployment's own public URL so the copy buttons
        // hand the operator the exact strings Google must be given. Falls
        // back to the request's own origin when NEXT_PUBLIC_APP_URL is unset,
        // which is at least a real address rather than a placeholder.
        redirectUris: expectedRedirectUris(
          process.env.NEXT_PUBLIC_APP_URL?.trim() || (host ? `${protocol}://${host}` : undefined)
        ),
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
        rateLimitDegraded: guard.degradedRateLimit,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      }
    );
  } catch (err) {
    console.error("[install/wizard]", sanitizeError(err));
    return NextResponse.json(
      {
        error:
          "The installer could not build its status view. The underlying cause is in the application's server log and is deliberately not returned here, because internal errors can contain configuration secrets.",
      },
      { status: 500 }
    );
  }
}
