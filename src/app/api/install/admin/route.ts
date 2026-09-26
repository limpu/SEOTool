import { z } from "zod";
import type { NextRequest } from "next/server";
import { createFirstAdmin, installAdminSchema } from "@/lib/install/actions/admin";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";
import { recordInstallStep } from "@/lib/install/state";

/**
 * Web Installer — POST /api/install/admin
 *
 * Creates the FIRST SUPER_ADMIN, and only ever the first one. The refusal
 * when an administrator already exists is the second, independent safety net
 * described in Stage 1: even if the installation lock somehow read
 * `not_complete` on a live system, this endpoint still could not mint an
 * administrator alongside existing ones, so the installer can never become an
 * authentication bypass for a running platform.
 *
 * ─── THE PLAINTEXT PASSWORD ─────────────────────────────────────────────
 * It is read from the body, passed to `hashPassword`, and then it is gone. It
 * is not logged, not echoed, not returned on success, and not included in any
 * failure payload — the response shape has no field that could hold it. The
 * completion screen shows the administrator's EMAIL and never the password,
 * because nothing kept it to show.
 *
 * Validation reuses `emailSchema` / `passwordSchema` from
 * `src/lib/validation/auth.ts` — the same rules the real registration form
 * applies, so the installer cannot create an account the application itself
 * would consider invalid.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ token: z.string().optional() }).and(installAdminSchema);

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body }) => {
      const result = await createFirstAdmin({
        name: body.name,
        email: body.email,
        password: body.password,
        confirmPassword: body.confirmPassword,
      });

      if (!result.ok) {
        return installerJson(
          { ok: false, code: result.code, error: result.message, howToFix: result.howToFix },
          result.httpStatus
        );
      }

      // Best-effort progress record so the wizard is resumable. A failure
      // here must never undo or obscure a successfully created administrator.
      await recordInstallStep("administrator", "complete").catch(() => {});

      // Id and email only. Never the password, never the hash.
      console.log(`[install/admin] created the first SUPER_ADMIN (id ${result.userId})`);

      return installerJson(
        {
          ok: true,
          userId: result.userId,
          email: result.email,
          name: result.name,
          superAdminVerified: result.superAdminVerified,
          message: result.message,
          notes: [
            "The account is email-verified, so it can sign in immediately — no verification code is needed, which matters because the code would be delivered by SMTP and SMTP is optional.",
            "The password is not stored anywhere it can be read back and will never be shown again by this installer.",
            "The installer will refuse to create another administrator. Any further accounts are created from Admin → Users inside the application.",
          ],
        },
        201
      );
    },
    "admin"
  );
}
