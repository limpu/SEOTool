import { NextResponse, type NextRequest } from "next/server";
import { guardInstallerRequest } from "@/lib/install/guard";
import { runAllChecks } from "@/lib/install/checks";
import { resolveRequestProtocol } from "@/lib/install/checks/network";
import { renderConfigGuidance } from "@/lib/install/deployment";
import { sanitizeError } from "@/lib/install/redact";

/**
 * Web Installer — GET /api/install/status
 *
 * Returns the full check matrix plus the dynamically-derived next required
 * step. READ-ONLY: this route runs the detection engine and nothing else. It
 * writes no file, mutates no database row, and calls no third-party service.
 *
 * Refuses in three ways, in this order:
 *   - 404 once installation is complete (the route ceases to exist);
 *   - 401 without a valid install token, rate-limited;
 *   - 503 for a mutation while installation state is unknown (not applicable
 *     to this route, which is read-only — an unreachable database still
 *     returns diagnostics here, because diagnosing that is the point).
 *
 * `force-dynamic` because every answer depends on the live request's host,
 * protocol and the current state of the world. A cached installer status
 * would be worse than none.
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

    // Names only — never values. `renderConfigGuidance` takes variable names
    // by design, so this cannot leak a secret into the response.
    const unresolvedVarNames = report.environment
      .filter((e) => e.classification === "missing" || e.classification === "invalid")
      .map((e) => e.name);

    return NextResponse.json(
      {
        installation: {
          status: report.installation.status,
          completed: report.installation.completed,
          completedAt: report.installation.completedAt,
          schemaMissing: report.installation.schemaMissing ?? false,
          reason: report.installation.reason,
          steps: report.installation.steps,
        },
        deployment: {
          mode: report.deployment.mode,
          orchestrator: report.deployment.orchestrator,
          platform: report.deployment.platform,
          evidence: report.deployment.evidence,
          envFileIsDurable: report.deployment.envFileIsDurable,
          restartRequired: report.deployment.restartRequired,
          guidance: renderConfigGuidance(report.deployment, unresolvedVarNames),
        },
        isProduction: report.isProduction,
        summary: report.summary,
        checks: report.checks,
        // Classification and reason only. `EnvVarReport` has no field that
        // can hold a variable's value, so no value can reach this response.
        environment: report.environment,
        migrations: report.migrations,
        nextRequiredStep: report.nextRequiredStep,
        steps: report.steps,
        rateLimitDegraded: guard.degradedRateLimit,
        generatedAt: report.generatedAt,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          // An installer response must never be indexed or archived if this
          // host is ever crawled while half-installed.
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      }
    );
  } catch (err) {
    // Sanitized, always. A raw error here could carry the connection string.
    console.error("[install/status]", sanitizeError(err));
    return NextResponse.json(
      {
        error:
          "The installer could not complete its checks. See the application's server log for the underlying cause — it is deliberately not returned here, because internal errors can contain configuration secrets.",
      },
      { status: 500 }
    );
  }
}
