import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { googleAnalyticsConnections } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWebsiteForUser } from "@/lib/websites/queries";
import { verifyGa4OAuthState, exchangeGa4CodeForTokens, GoogleTokenExchangeError } from "@/lib/ga4/oauth";
import { encryptGa4Token, isGa4TokenEncryptionConfigured } from "@/lib/ga4/crypto";
import { getGa4Config, GA4_NOT_CONFIGURED_MESSAGE } from "@/lib/ga4/config";

/**
 * OAuth callback for Google Analytics — a single, fixed URL
 * (`/api/ga4/callback`), exactly mirroring GSC's `/api/gsc/callback` design
 * (Phase 26): Google requires an exact-match registered redirect URI, so
 * this cannot be scoped under `/websites/[id]/...`. The website this
 * authorization belongs to instead travels inside the signed `state`
 * parameter (see `signGa4OAuthState` in `src/lib/ga4/oauth.ts`).
 *
 * On success, redirects back to the website's Google Analytics page with a
 * `?ga4=` query flag the panel component reads to show a one-time
 * success/error banner and re-fetch connection status.
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

  const statePayload = await verifyGa4OAuthState(state);
  if (!statePayload || statePayload.userId !== user.id) {
    return redirectWithFlag(req, null, "invalid_state");
  }

  const site = await getWebsiteForUser(user.id, statePayload.websiteId);
  if (!site) {
    return redirectWithFlag(req, null, "invalid_state");
  }

  const config = getGa4Config();
  if (!config || !isGa4TokenEncryptionConfigured()) {
    return redirectWithFlag(req, site.id, "not_configured", GA4_NOT_CONFIGURED_MESSAGE);
  }

  try {
    const tokens = await exchangeGa4CodeForTokens(code);
    if (!tokens.refresh_token) {
      return redirectWithFlag(
        req,
        site.id,
        "no_refresh_token",
        "Google did not return a refresh token. Please disconnect and try connecting again, making sure to approve offline access."
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db
      .insert(googleAnalyticsConnections)
      .values({
        userId: user.id,
        websiteId: site.id,
        scope: tokens.scope,
        accessToken: encryptGa4Token(tokens.access_token),
        tokenExpiresAt: expiresAt,
        refreshToken: encryptGa4Token(tokens.refresh_token),
      })
      .onConflictDoUpdate({
        target: googleAnalyticsConnections.websiteId,
        set: {
          userId: user.id,
          scope: tokens.scope,
          accessToken: encryptGa4Token(tokens.access_token),
          tokenExpiresAt: expiresAt,
          refreshToken: encryptGa4Token(tokens.refresh_token),
          // Re-connecting clears any previously selected property — the
          // reconnecting Google account may not have access to the same
          // property, so re-selection is the safe default (same rule as GSC).
          googleAccountId: null,
          googleAccountEmail: null,
          propertyId: null,
          propertyName: null,
          measurementId: null,
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
  const base = websiteId ? `/websites/${websiteId}/google-analytics` : "/websites";
  const target = new URL(base, req.url);
  target.searchParams.set("ga4", flag);
  if (message) target.searchParams.set("ga4Message", message);
  return NextResponse.redirect(target);
}
