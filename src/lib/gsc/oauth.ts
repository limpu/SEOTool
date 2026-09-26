import { SignJWT, jwtVerify } from "jose";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GSC_OAUTH_SCOPE,
  getGscConfig,
  type GscConfig,
} from "./config";

const STATE_DURATION_SECONDS = 600; // 10 minutes — plenty for a user to complete Google's consent screen.

function getStateSecret(): Uint8Array {
  // Reuses JWT_SECRET (same env var Phase 3's session tokens sign with,
  // see src/lib/auth/session.ts) rather than introducing a second secret
  // env var for a token whose only job is short-lived CSRF protection —
  // this is a different *purpose* (one-shot state, not a session) but the
  // same "signed, server-verified, short-lived JWT" security pattern Phase
  // 3 already established.
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return new TextEncoder().encode(secret);
}

export interface GscOAuthState {
  websiteId: string;
  userId: string;
  nonce: string;
}

/**
 * Signs a CSRF-protected `state` parameter binding this OAuth attempt to a
 * specific website + user. Google returns this value verbatim on the
 * callback; verifying its signature (and that it hasn't expired) proves the
 * callback request corresponds to an authorization flow this server
 * actually initiated, rather than an attacker-supplied `code`/`state` pair
 * (the standard OAuth CSRF mitigation, RFC 6749 §10.12).
 */
export async function signOAuthState(payload: GscOAuthState): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_DURATION_SECONDS}s`)
    .sign(getStateSecret());
}

/** Verifies and decodes a `state` parameter. Returns null if invalid/expired/tampered. */
export async function verifyOAuthState(token: string): Promise<GscOAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, getStateSecret());
    const websiteId = payload["websiteId"] as string | undefined;
    const userId = payload["userId"] as string | undefined;
    const nonce = payload["nonce"] as string | undefined;
    if (!websiteId || !userId || !nonce) return null;
    return { websiteId, userId, nonce };
  } catch {
    return null;
  }
}

/**
 * Builds the full Google OAuth 2.0 authorization-code consent-screen URL.
 * `access_type=offline` + `prompt=consent` guarantee Google returns a
 * refresh token on every authorization (Google otherwise only issues a
 * refresh token on a user's *first* consent for this client, which would
 * silently break re-connecting a previously-connected, then-disconnected
 * website).
 */
export function buildAuthUrl(config: GscConfig, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GSC_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class GoogleTokenExchangeError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/** Exchanges an authorization `code` for access + refresh tokens. */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const config = getGscConfig();
  if (!config) throw new Error("Google OAuth is not configured.");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleTokenExchangeError(`Google token exchange failed: ${res.status} ${body}`, res.status);
  }

  return (await res.json()) as GoogleTokenResponse;
}

/** Exchanges a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = getGscConfig();
  if (!config) throw new Error("Google OAuth is not configured.");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleTokenExchangeError(`Google token refresh failed: ${res.status} ${body}`, res.status);
  }

  return (await res.json()) as GoogleTokenResponse;
}

/**
 * True if a stored access token needs refreshing before use. A 60-second
 * safety margin avoids a race where the token is valid at check-time but
 * expires mid-flight during the subsequent API call.
 */
export function needsRefresh(accessTokenExpiresAt: Date, now: Date = new Date()): boolean {
  const marginMs = 60_000;
  return accessTokenExpiresAt.getTime() - now.getTime() <= marginMs;
}
