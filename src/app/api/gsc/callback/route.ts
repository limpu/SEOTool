import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gscConnections } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { verifyOAuthState, exchangeCodeForTokens, GoogleTokenExchangeError } from "@/lib/gsc/oauth";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/gsc/crypto";
import { getGscConfig, GSC_NOT_CONFIGURED_MESSAGE } from "@/lib/gsc/config";

/**
 * OAuth callback. This is a single, fixed URL (not scoped under
 * `/websites/[id]/...`) because it must exactly match the one redirect URI
 * registered with Google Cloud for this app's OAuth client — Google does
 * not support wildcard/dynamic-segment redirect URIs. The website this
 * authorization belongs to is instead carried inside the signed `state`
 * parameter (see `signOAuthState` in `src/lib/gsc/oauth.ts`), which also
 * doubles as this flow's CSRF protection per RFC 6749 §10.12.
 *
 * On success, redirects back to the website detail page with a `?gsc=`
 * query flag the panel component reads to show a one-time success/error
 * banner and re-fetch connection status — no server-rendered state is
 * threaded through, keeping this a plain redirect-based flow.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (errorParam) {
    // User declined consent, or Google reported an error — not a bug.
    return redirectWithFlag(req, null, "denied");
  }

  if (!code || !state) {
    return redirectWithFlag(req, null, "invalid_request");
  }

  const statePayload = await verifyOAuthState(state);
  if (!statePayload || statePayload.userId !== user.id) {
    return redirectWithFlag(req, null, "invalid_state");
  }

  const site = await getWebsiteForUser(user.id, statePayload.websiteId);
  if (!site) {
    return redirectWithFlag(req, null, "invalid_state");
  }

  const config = getGscConfig();
  if (!config || !isTokenEncryptionConfigured()) {
    return redirectWithFlag(req, site.id, "not_configured", GSC_NOT_CONFIGURED_MESSAGE);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only omits this if the user has already granted this exact
      // client offline access before and Google chose not to reissue one —
      // `prompt=consent` in buildAuthUrl is specifically meant to prevent
      // this, but handle it defensively rather than silently storing no
      // refresh token (which would make sync work once and then break
      // after the first access-token expiry).
      return redirectWithFlag(
        req,
        site.id,
        "no_refresh_token",
        "Google did not return a refresh token. Please disconnect and try connecting again, making sure to approve offline access."
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db
      .insert(gscConnections)
      .values({
        websiteId: site.id,
        connectedByUserId: user.id,
        scope: tokens.scope,
        accessTokenEncrypted: encryptToken(tokens.access_token),
        accessTokenExpiresAt: expiresAt,
        refreshTokenEncrypted: encryptToken(tokens.refresh_token),
        lastSyncStatus: "never",
      })
      .onConflictDoUpdate({
        target: gscConnections.websiteId,
        set: {
          connectedByUserId: user.id,
          scope: tokens.scope,
          accessTokenEncrypted: encryptToken(tokens.access_token),
          accessTokenExpiresAt: expiresAt,
          refreshTokenEncrypted: encryptToken(tokens.refresh_token),
          // Re-connecting clears any previously selected property — the
          // reconnecting Google account may not have access to the same
          // property, so re-selection is the safe default.
          propertyUrl: null,
          lastSyncStatus: "never",
          lastSyncError: null,
          updatedAt: new Date(),
        },
      });

    return redirectWithFlag(req, site.id, "connected");
  } catch (err) {
    const message = err instanceof GoogleTokenExchangeError ? err.message : "Failed to complete Google OAuth.";
    return redirectWithFlag(req, site.id, "error", message);
  }
}

function redirectWithFlag(req: NextRequest, websiteId: string | null, flag: string, message?: string) {
  const base = websiteId ? `/websites/${websiteId}` : "/websites";
  const target = new URL(base, req.url);
  target.searchParams.set("gsc", flag);
  if (message) target.searchParams.set("gscMessage", message);
  return NextResponse.redirect(target);
}
