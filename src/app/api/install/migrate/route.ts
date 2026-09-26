import { z } from "zod";
import type { NextRequest } from "next/server";
import { runPendingMigrations } from "@/lib/install/actions/migrate";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";
import { checkMigrations } from "@/lib/install/checks/migrations";

/**
 * Web Installer — POST /api/install/migrate
 *
 * Applies pending migrations in filename order, discovered from disk, each in
 * its own transaction, stopping immediately on the first failure. See
 * `src/lib/install/actions/migrate.ts` for why every one of those clauses is
 * load-bearing.
 *
 * After the run this route RE-RUNS Stage 1's migration CHECK and returns its
 * result alongside. That is deliberate: the runner reporting "applied" is the
 * runner's own account of what it did, and this installer's rule is that a
 * claimed write is re-measured rather than believed. The `after` field is the
 * measurement; `run` is the narrative.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ token: z.string().optional() });

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ projectRoot }) => {
      const connectionString = process.env.DATABASE_URL;
      const run = await runPendingMigrations({ projectRoot, connectionString });

      // Independent re-measurement of the live schema.
      const after = await checkMigrations(projectRoot, connectionString);

      return installerJson(
        {
          ok: run.ok,
          message: run.message,
          appliedCount: run.appliedCount,
          skippedCount: run.skippedCount,
          steps: run.steps,
          failure: run.failure,
          before: run.before,
          after: { check: after.result, report: after.report },
          notes: [
            "Migrations are applied in filename order, discovered from disk on every run — no count is hard-coded anywhere.",
            "Each file runs in its own transaction and is verified before it is committed. A failure rolls that file back and stops the run; nothing after it is attempted.",
            "This installer never drops, truncates or resets anything to get past a failure.",
            "Re-running is safe: applied migrations are skipped, and migrations whose objects a later file deliberately drops are never re-applied.",
          ],
        },
        run.ok ? 200 : 500
      );
    },
    "migrate"
  );
}
