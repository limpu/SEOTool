import { z } from "zod";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { completeInstallation, evaluateCompletionGate } from "@/lib/install/actions/complete";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";
import { runAllChecks } from "@/lib/install/checks";
import { resolveRequestProtocol } from "@/lib/install/checks/network";
import { isSuperAdmin } from "@/lib/rbac/queries";

/**
 * Web Installer — POST /api/install/complete
 *
 * The one irreversible action. It writes the database lock and deletes the
 * token file, after which `/install` returns a genuine 404 for this database.
 *
 * ─── THE GATE IS RE-MEASURED HERE, NOT TRUSTED FROM THE CLIENT ──────────
 * The full check matrix is run again inside this request. The wizard already
 * knows whether completion is allowed, but the wizard is a client and a
 * client's opinion is not a control: a caller could post straight to this
 * route with no wizard involved at all. `evaluateCompletionGate` is a pure
 * function over the live report, so the same policy the UI renders is the one
 * enforced here.
 *
 * ─── WHO COMPLETED IT ───────────────────────────────────────────────────
 * `completed_by_user_id` must be a real SUPER_ADMIN. A client-supplied id is
 * VERIFIED with `isSuperAdmin()` before it is recorded — accepting it on
 * trust would let the completion record name any user in the database. When
 * none is supplied, the sole existing SUPER_ADMIN is resolved from the
 * database; if there are several, the record is left unattributed rather than
 * guessing, because an incorrect attribution is worse than none.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  token: z.string().optional(),
  /** Verified before use — never recorded on the client's word. */
  adminUserId: z.string().uuid().optional(),
  /** The operator must acknowledge that this cannot be undone. */
  confirm: z.literal("complete-installation"),
});

async function resolveCompletingUser(claimed: string | undefined): Promise<string | null> {
  if (claimed && (await isSuperAdmin(claimed).catch(() => false))) return claimed;

  const rows = await db.execute<{ user_id: string }>(
    sql`SELECT DISTINCT ur.user_id
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE r.key = 'SUPER_ADMIN'`
  );
  const list = (rows as unknown as { rows?: { user_id: string }[] }).rows ?? [];
  // Exactly one is the only unambiguous answer. Several means the installer
  // cannot know which human is at the keyboard, and inventing an answer to a
  // provenance question is precisely what this project forbids.
  return list.length === 1 ? list[0].user_id : null;
}

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body, req: request, projectRoot }) => {
      const { protocol } = resolveRequestProtocol(request.headers);
      const report = await runAllChecks({
        requestProtocol: protocol,
        requestHost: request.headers.get("host") ?? undefined,
        projectRoot,
      });

      const gate = evaluateCompletionGate(report);
      if (!gate.allowed) {
        return installerJson(
          {
            ok: false,
            completed: false,
            error: gate.reason,
            // Each blocker already carries its own summary and howToFix, so
            // the wizard renders what's wrong / why it matters / how to fix
            // it without this route inventing any new prose.
            blockers: gate.blockers,
            warnings: gate.warnings,
            consequences: gate.consequences,
          },
          409
        );
      }

      const completedBy = await resolveCompletingUser(body.adminUserId);
      if (!completedBy) {
        return installerJson(
          {
            ok: false,
            completed: false,
            error:
              "The administrator who is completing this installation could not be identified unambiguously, so the completion record would name the wrong person or nobody at all.",
            howToFix: [
              "Reload the installer so it re-reads the administrator account it created, then complete again.",
              "If more than one administrator already exists, this installation was not a first install — sign in to the application instead.",
            ],
          },
          409
        );
      }

      const result = await completeInstallation({ userId: completedBy, projectRoot });
      if (!result.ok) {
        return installerJson(
          { ok: false, completed: false, error: result.message, howToFix: result.howToFix },
          result.httpStatus
        );
      }

      console.log("[install/complete] installation marked complete; the installer is now closed");

      return installerJson({
        ok: true,
        completed: true,
        completedByUserId: result.completedByUserId,
        tokenFileRemoved: result.tokenFileRemoved,
        message: result.message,
        notes: result.notes,
        consequences: gate.consequences,
        // Shown on the completion screen so anything still imperfect is not
        // quietly buried by a success banner.
        remainingWarnings: gate.warnings.map((w) => ({
          id: w.id,
          label: w.label,
          summary: w.summary,
          howToFix: w.howToFix,
        })),
      });
    },
    "complete"
  );
}
