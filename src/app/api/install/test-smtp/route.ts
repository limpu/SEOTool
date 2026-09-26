import { z } from "zod";
import type { NextRequest } from "next/server";
import { sendSmtpTest, smtpTestSchema } from "@/lib/install/actions/smtp";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";

/**
 * Web Installer — POST /api/install/test-smtp
 *
 * Sends a REAL test email to an operator-supplied recipient, through the
 * application's own transport.
 *
 * ─── WHY THE TOKEN GATE IS NOT OPTIONAL HERE ────────────────────────────
 * "Send mail to an address the caller names" is, unauthenticated, an open
 * spam relay: anyone on the internet could make this deployment send mail from
 * its own verified domain to arbitrary recipients, which gets the domain
 * blacklisted and turns the installation into an abuse appliance. It goes
 * through the same guard as every other installer route, as a MUTATION —
 * it has a real external side effect, so it is refused with 404 once the
 * installer is locked and with 503 while installation state is unknown.
 *
 * Credentials never appear in any response: EMAIL_PASS is one of Stage 1's
 * `SECRET_ENV_VARS`, so `sanitizeForDisplay` removes it verbatim from any
 * server message, and the reported configuration carries host, port, TLS mode
 * and whether authentication is configured — never a username or a password.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ token: z.string().optional() }).and(smtpTestSchema);

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body }) => {
      const outcome = await sendSmtpTest(body.recipient);
      // No recipient, no host and no credential in the log line — the verdict only.
      console.log(`[install/test-smtp] result: ${outcome.cause}`);
      return installerJson({
        ...outcome,
        optional: true,
        optionalNote:
          "Email is optional. Without it the platform still runs: verification codes and password-reset links are written to the server log instead of being delivered, so an administrator can still complete those flows manually.",
      });
    },
    "test-smtp"
  );
}
