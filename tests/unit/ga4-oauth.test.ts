import { describe, it, expect, beforeAll } from "vitest";
import { buildGa4AuthUrl, signGa4OAuthState, verifyGa4OAuthState, ga4NeedsRefresh } from "@/lib/ga4/oauth";
import { GA4_OAUTH_SCOPE, GOOGLE_AUTH_URL } from "@/lib/ga4/config";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-for-vitest-only";
});

describe("buildGa4AuthUrl", () => {
  const config = {
    clientId: "test-client-id.apps.googleusercontent.com",
    clientSecret: "test-secret",
    redirectUri: "http://localhost:3000/api/ga4/callback",
  };

  it("points at Google's real OAuth authorization endpoint", () => {
    const url = new URL(buildGa4AuthUrl(config, "some-state"));
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);
    expect(url.hostname).toBe("accounts.google.com");
  });

  it("requests the read-only analytics scope, not read/write", () => {
    const url = new URL(buildGa4AuthUrl(config, "some-state"));
    expect(url.searchParams.get("scope")).toBe(GA4_OAUTH_SCOPE);
    expect(url.searchParams.get("scope")).toContain("readonly");
    expect(url.searchParams.get("scope")).toContain("analytics");
  });

  it("includes client_id, redirect_uri, response_type=code, and the signed state", () => {
    const url = new URL(buildGa4AuthUrl(config, "signed-state-value"));
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed-state-value");
  });

  it("requests offline access + forced consent so a refresh token is always issued", () => {
    const url = new URL(buildGa4AuthUrl(config, "some-state"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("GA4 OAuth state signing (CSRF protection)", () => {
  it("round-trips a signed state back to its original payload", async () => {
    const token = await signGa4OAuthState({ websiteId: "11111111-1111-1111-1111-111111111111", userId: "u1", nonce: "abc" });
    const verified = await verifyGa4OAuthState(token);
    expect(verified).toEqual({ websiteId: "11111111-1111-1111-1111-111111111111", userId: "u1", nonce: "abc" });
  });

  it("rejects a garbage/tampered token", async () => {
    const verified = await verifyGa4OAuthState("not-a-real-jwt");
    expect(verified).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const badToken = await new SignJWT({ websiteId: "w", userId: "u", nonce: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("a-completely-different-secret-value"));
    const verified = await verifyGa4OAuthState(badToken);
    expect(verified).toBeNull();
  });

  it("produces two different tokens for two different nonces (unguessable state)", async () => {
    const a = await signGa4OAuthState({ websiteId: "w", userId: "u", nonce: "n1" });
    const b = await signGa4OAuthState({ websiteId: "w", userId: "u", nonce: "n2" });
    expect(a).not.toBe(b);
  });
});

describe("ga4NeedsRefresh", () => {
  it("true when the token already expired", () => {
    const past = new Date(Date.now() - 1000);
    expect(ga4NeedsRefresh(past)).toBe(true);
  });

  it("true when the token expires within the safety margin (60s)", () => {
    const soon = new Date(Date.now() + 30_000);
    expect(ga4NeedsRefresh(soon)).toBe(true);
  });

  it("false when the token has plenty of remaining lifetime", () => {
    const later = new Date(Date.now() + 30 * 60_000);
    expect(ga4NeedsRefresh(later)).toBe(false);
  });
});
