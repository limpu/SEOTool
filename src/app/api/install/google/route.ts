import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  GOOGLE_SCOPES,
  GOOGLE_SETUP_CHECKLIST,
  TESTING_MODE_REFRESH_TOKEN_DAYS,
  googleConfigSchema,
  validateGoogleConfig,
} from "@/lib/install/actions/google";
import { applyEnvUpdates } from "@/lib/install/actions/env-file";
import { installerJson, withInstallerMutation } from "@/lib/install/actions/route-helpers";
import { detectDeploymentMode } from "@/lib/install/deployment";

/**
 * Web Installer — POST /api/install/google
 *
 * Validates Google OAuth configuration for SHAPE AND CONSISTENCY, then
 * persists it the same way any other configuration is persisted (a `.env`
 * write on a traditional host, an injection snippet in a container).
 *
 * ─── NO HANDSHAKE. NOT EVEN A SMALL ONE. ────────────────────────────────
 * This route never contacts Google. Real authorisation stays an explicit
 * post-install action taken by the person whose Search Console and Analytics
 * data it grants access to. An installer that opened a consent screen would
 * be asking for a third party's data on behalf of a platform that is not
 * finished being installed, and the refresh token it obtained would be
 * encrypted under keys the operator may still be about to rotate.
 *
 * The response therefore carries an explicit disclaimer saying what was and
 * was not proven, plus the setup checklist as GUIDANCE — the installer cannot
 * read Google's console and never claims to know whether the APIs are enabled
 * or the consent screen is published.
 *
 * A validation ERROR refuses to persist. A validation WARNING does not: a
 * redirect URI that does not match `NEXT_PUBLIC_APP_URL` is by far the most
 * likely cause of `redirect_uri_mismatch`, but a deployment mid-migration to
 * a new domain can legitimately have the two disagree, and refusing would
 * make a correct configuration unsaveable.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z
  .object({
    token: z.string().optional(),
    /** When false, validate and return advice without writing anything. */
    persist: z.boolean().optional(),
  })
  .and(googleConfigSchema);

export async function POST(req: NextRequest) {
  return withInstallerMutation(
    req,
    schema,
    async ({ body, projectRoot }) => {
      const isProduction = process.env.NODE_ENV === "production";
      const validation = validateGoogleConfig(
        {
          clientId: body.clientId,
          clientSecret: body.clientSecret,
          gscRedirectUri: body.gscRedirectUri,
          ga4RedirectUri: body.ga4RedirectUri,
        },
        { appUrl: process.env.NEXT_PUBLIC_APP_URL, isProduction }
      );

      const reference = {
        scopes: GOOGLE_SCOPES,
        checklist: GOOGLE_SETUP_CHECKLIST,
        testingModeWarning: {
          days: TESTING_MODE_REFRESH_TOKEN_DAYS,
          message: `A consent screen left in Testing mode issues refresh tokens that Google expires after ${TESTING_MODE_REFRESH_TOKEN_DAYS} days. Everything works for a week and then every connection breaks at once with an 'invalid_grant' error, and every user has to reconnect. This was observed directly during this project's development — publish the consent screen before real use.`,
        },
        disclaimer: validation.disclaimer,
      };

      if (!validation.valid) {
        return installerJson(
          {
            ok: false,
            persisted: false,
            error:
              "These credentials were not saved. The problems below would stop Google authorisation from working, and each one is cheaper to fix now than after a failed connection attempt.",
            validation,
            ...reference,
          },
          400
        );
      }

      if (body.persist === false) {
        return installerJson({ ok: true, persisted: false, validation, ...reference });
      }

      const detection = detectDeploymentMode();
      const outcome = await applyEnvUpdates({
        projectRoot,
        detection,
        updates: {
          GOOGLE_CLIENT_ID: body.clientId,
          GOOGLE_CLIENT_SECRET: body.clientSecret,
          GOOGLE_OAUTH_REDIRECT_URI: body.gscRedirectUri,
          GOOGLE_GA4_OAUTH_REDIRECT_URI: body.ga4RedirectUri,
        },
      });

      if (outcome.mode === "error") {
        return installerJson({ ok: false, ...outcome, validation, ...reference }, 500);
      }

      // Names only. GOOGLE_CLIENT_SECRET must never reach a log line.
      console.log("[install/google] saved GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and both redirect URIs");

      return installerJson({ ok: true, env: outcome, validation, ...reference });
    },
    "google"
  );
}
