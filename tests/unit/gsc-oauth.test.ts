import { describe, it, expect, beforeAll } from "vitest";
import { buildAuthUrl, signOAuthState, verifyOAuthState, needsRefresh } from "@/lib/gsc/oauth";
import { GSC_OAUTH_SCOPE, GOOGLE_AUTH_URL } from "@/lib/gsc/config";

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-for-vitest-only";
});

describe("buildAuthUrl", () => {
  const config = {
    clientId: "test-client-id.apps.googleusercontent.com",
    clientSecret: "test-secret",
    redirectUri: "http://localhost:3000/api/gsc/callback",
  };

  it("points at Google's real OAuth authorization endpoint", () => {
    const url = new URL(buildAuthUrl(config, "some-state"));
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);
    expect(url.hostname).toBe("accounts.google.com");
  });

  it("requests the read-only webmasters scope, not read/write", () => {
    const url = new URL(buildAuthUrl(config, "some-state"));
    expect(url.searchParams.get("scope")).toBe(GSC_OAUTH_SCOPE);
    expect(url.searchParams.get("scope")).toContain("readonly");
  });

  it("includes client_id, redirect_uri, response_type=code, and the signed state", () => {
    const url = new URL(buildAuthUrl(config, "signed-state-value"));
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed-state-value");
  });

  it("requests offline access + forced consent so a refresh token is always issued", () => {
    const url = new URL(buildAuthUrl(config, "some-state"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("OAuth state signing (CSRF protection)", () => {
  it("round-trips a signed state back to its original payload", async () => {
    const token = await signOAuthState({ websiteId: "11111111-1111-1111-1111-111111111111", userId: "u1", nonce: "abc" });
    const verified = await verifyOAuthState(token);
    expect(verified).toEqual({ websiteId: "11111111-1111-1111-1111-111111111111", userId: "u1", nonce: "abc" });
  });

  it("rejects a garbage/tampered token", async () => {
    const verified = await verifyOAuthState("not-a-real-jwt");
    expect(verified).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const badToken = await new SignJWT({ websiteId: "w", userId: "u", nonce: "n" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("a-completely-different-secret-value"));
    const verified = await verifyOAuthState(badToken);
    expect(verified).toBeNull();
  });

  it("produces two different tokens for two different nonces (unguessable state)", async () => {
    const a = await signOAuthState({ websiteId: "w", userId: "u", nonce: "n1" });
    const b = await signOAuthState({ websiteId: "w", userId: "u", nonce: "n2" });
    expect(a).not.toBe(b);
  });
});

describe("needsRefresh", () => {
  it("true when the token already expired", () => {
    const past = new Date(Date.now() - 1000);
    expect(needsRefresh(past)).toBe(true);
  });

  it("true when the token expires within the safety margin (60s)", () => {
    const soon = new Date(Date.now() + 30_000);
    expect(needsRefresh(soon)).toBe(true);
  });

  it("false when the token has plenty of remaining lifetime", () => {
    const later = new Date(Date.now() + 30 * 60_000);
    expect(needsRefresh(later)).toBe(false);
  });
});
