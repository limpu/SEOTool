/**
 * Google OAuth / Search Console configuration. Reads three required env
 * vars — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
 * — none of which are set in this environment (no Google Cloud project has
 * been created for this project yet; see read.md Phase 26 write-up). Every
 * caller must go through `getGscConfig()` / `isGscConfigured()` and handle
 * the "not configured" case explicitly rather than assuming these are
 * present — Section 79's "no fake data" rule extends to never pretending
 * the integration is available when it isn't.
 */

// Read-only Search Console scope. This product only ever reads GSC data —
// it never modifies sitemaps, verified sites, or any other Search Console
// setting, so it deliberately requests `webmasters.readonly`, not the
// broader `webmasters` (read/write) scope.
export const GSC_OAUTH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GSC_SITES_LIST_URL = "https://www.googleapis.com/webmasters/v3/sites";
export const GSC_SEARCH_ANALYTICS_URL_TEMPLATE =
  "https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query";

export interface GscConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGscConfig(): GscConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGscConfigured(): boolean {
  return getGscConfig() !== null;
}

export const GSC_NOT_CONFIGURED_MESSAGE =
  "Google Search Console integration is not configured — an administrator must add Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI) to the environment before this feature can be used.";
