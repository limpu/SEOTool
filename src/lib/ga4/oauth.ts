import { SignJWT, jwtVerify } from "jose";
import { GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GA4_OAUTH_SCOPE, getGa4Config, type Ga4Config } from "./config";

const STATE_DURATION_SECONDS = 600; // 10 minutes — plenty for a user to complete Google's consent screen.

function getStateSecret(): Uint8Array {
  // Same "signed, server-verified, short-lived JWT" CSRF pattern as
  // src/lib/gsc/oauth.ts, reusing JWT_SECRET for the same reason (this is a
  // one-shot state token, not a session, so a dedicated secret env var
  // isn't warranted).
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return new TextEncoder().encode(secret);
}

export interface Ga4OAuthState {
  websiteId: string;
  userId: string;
  nonce: string;
}

/**
 * Signs a CSRF-protected `state` parameter binding this OAuth attempt to a
 * specific website + user, exactly mirroring GSC's design (RFC 6749 §10.12).
 * Uses a distinct payload/verify pair from GSC's (not the same functions)
 * so a state token minted for one integration's callback can never be
 * replayed against the other's.
 */
export async function signGa4OAuthState(payload: Ga4OAuthState): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_DURATION_SECONDS}s`)
    .sign(getStateSecret());
}

/** Verifies and decodes a `state` parameter. Returns null if invalid/expired/tampered. */
export async function verifyGa4OAuthState(token: string): Promise<Ga4OAuthState | null> {
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
 * Builds the full Google OAuth 2.0 authorization-code consent-screen URL
 * for the Analytics scope. `access_type=offline` + `prompt=consent`
 * guarantee a refresh token on every authorization, same reasoning as GSC.
 */
export function buildGa4AuthUrl(config: Ga4Config, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GA4_OAUTH_SCOPE);
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
export async function exchangeGa4CodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const config = getGa4Config();
  if (!config) throw new Error("Google Analytics OAuth is not configured.");

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
export async function refreshGa4AccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = getGa4Config();
  if (!config) throw new Error("Google Analytics OAuth is not configured.");

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

/** True if a stored access token needs refreshing before use (60s safety margin). */
export function ga4NeedsRefresh(accessTokenExpiresAt: Date, now: Date = new Date()): boolean {
  const marginMs = 60_000;
  return accessTokenExpiresAt.getTime() - now.getTime() <= marginMs;
}
