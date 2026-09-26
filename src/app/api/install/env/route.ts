import { z } from "zod";
import type { NextRequest } from "next/server";
import { applyEnvUpdates } from "@/lib/install/actions/env-file";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";
import { ENV_CATALOG } from "@/lib/install/checks/environment";
import { GENERATABLE_SECRETS } from "@/lib/install/actions/secrets";
import { detectDeploymentMode } from "@/lib/install/deployment";

/**
 * Web Installer — POST /api/install/env
 *
 * Persists configuration values, or — in a container — returns the exact
 * environment block to inject and writes nothing. `applyEnvUpdates` makes
 * that decision from the detected deployment mode; this route just carries
 * the guard and shapes the response.
 *
 * ─── THE ALLOW-LIST IS A SECURITY CONTROL, NOT TIDINESS ─────────────────
 * Only variable names this application actually reads may be written. Without
 * that, "write these keys to .env" is an arbitrary-file-content primitive:
 * a caller could append `NODE_OPTIONS=--require ./evil.js` and get code
 * execution on the next restart, or set `PATH`, or define a variable some
 * dependency reads. The list is derived from `ENV_CATALOG` — which Stage 1
 * built from real `process.env.` usages in `src/` — plus the three secrets
 * this installer can generate.
 *
 * ─── WHAT THIS ROUTE NEVER CLAIMS ───────────────────────────────────────
 * That the values are active. They are not: Next.js reads `.env` once at
 * process start. The response says a restart is required and the wizard
 * re-runs the affected checks afterwards rather than believing its own write.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every name this installer is permitted to write. Nothing else, ever. */
export const WRITABLE_ENV_NAMES: ReadonlySet<string> = new Set([
  ...ENV_CATALOG.map((s) => s.name),
  ...Object.keys(GENERATABLE_SECRETS),
]);

const schema = z.object({
  token: z.string().optional(),
  updates: z.record(z.string(), z.string().max(4096)),
});

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body, projectRoot }) => {
      const names = Object.keys(body.updates);
      const rejected = names.filter((n) => !WRITABLE_ENV_NAMES.has(n));
      if (rejected.length > 0) {
        return installerJson(
          {
            error: `The installer only writes variables this application reads. Refused: ${rejected.join(", ")}.`,
            howToFix: [
              "Remove those names and save again.",
              "Any other variable must be set by hand, deliberately, outside the installer — allowing arbitrary names here would let this endpoint change how the application starts.",
            ],
            allowed: [...WRITABLE_ENV_NAMES].sort(),
          },
          400
        );
      }

      const detection = detectDeploymentMode();
      const outcome = await applyEnvUpdates({
        projectRoot,
        updates: body.updates,
        detection,
      });

      if (outcome.mode === "error") {
        return installerJson({ ...outcome }, 500);
      }

      // Names only in the log line — never a value. Several of these are
      // secrets, and a "saved EMAIL_PASS=…" log line would be the exact
      // leak the rest of this module is built to prevent.
      console.log(
        `[install/env] ${outcome.persisted ? "wrote" : "rendered guidance for"} ${names.length} variable(s): ${names.join(", ")}`
      );

      return installerJson({
        ...outcome,
        deployment: {
          mode: detection.mode,
          orchestrator: detection.orchestrator,
          envFileIsDurable: detection.envFileIsDurable,
          evidence: detection.evidence,
        },
        // The wizard must re-run the checks rather than trusting this
        // response — stated in the payload so the contract is explicit.
        reverify:
          "Re-run the checks after restarting the application. This installer reports a value as active only after observing it in the running process.",
      });
    },
    "env"
  );
}
