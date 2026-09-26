/**
 * Google OAuth / Analytics (GA4) configuration — Phase 36.
 *
 * OAuth client design decision (see read.md's Phase 36 write-up for full
 * reasoning): this reuses the SAME `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
 * as Phase 26's Search Console integration, rather than registering a second
 * Google Cloud OAuth client. Google's OAuth 2.0 model allows a single client
 * to request different scopes on different authorization requests — nothing
 * about the client registration is scope-specific, only the *consent
 * screen's requested scope* and the *redirect URI* vary per flow. This
 * integration uses its own dedicated redirect URI
 * (`GOOGLE_GA4_OAUTH_REDIRECT_URI`, exactly-registered with Google
 * separately from GSC's) and its own scope
 * (`https://www.googleapis.com/auth/analytics.readonly`), so a user who has
 * never connected GSC can still connect GA4 (and vice versa) — the two
 * flows are fully independent at the token/connection level even though
 * they share one Cloud project's client credentials. This is simpler to
 * operate (one Cloud project, one set of credentials to provision) than a
 * second OAuth client, with no security downside: token storage,
 * encryption keys, and DB connection rows are already fully independent
 * per integration (see crypto.ts).
 */

// Read-only Analytics scope — this product only ever reads GA4 report data
// via the Data API and lists properties via the Admin API; it never
// modifies Analytics configuration.
export const GA4_OAUTH_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Google Analytics Admin API v1beta — lists the account summaries (and
// nested property summaries) the connected Google account has access to.
export const GA4_ACCOUNT_SUMMARIES_URL =
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

// Google Analytics Data API v1beta — the GA4 reporting API (`runReport`),
// distinct from the deprecated Universal Analytics Reporting API.
export const GA4_RUN_REPORT_URL_TEMPLATE =
  "https://analyticsdata.googleapis.com/v1beta/{property}:runReport";

export interface Ga4Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGa4Config(): Ga4Config | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_GA4_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGa4Configured(): boolean {
  return getGa4Config() !== null;
}

export const GA4_NOT_CONFIGURED_MESSAGE =
  "Google Analytics integration is not configured — an administrator must add Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GA4_OAUTH_REDIRECT_URI) to the environment before this feature can be used.";
