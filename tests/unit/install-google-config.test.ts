import { describe, expect, it } from "vitest";
import {
  GOOGLE_SCOPES,
  GOOGLE_SETUP_CHECKLIST,
  TESTING_MODE_REFRESH_TOKEN_DAYS,
  expectedRedirectUris,
  validateGoogleConfig,
} from "@/lib/install/actions/google";

/**
 * Web Installer — Stage 2. Google configuration: shape and consistency only.
 *
 * The single most valuable assertion in this file is the exact-string one.
 * Google matches redirect URIs by EXACT STRING, so a trailing slash or an
 * `http` where `https` was registered produces `redirect_uri_mismatch` — an
 * error whose text tells the operator nothing about which of those it was.
 * Catching it here, against the deployment's own public URL, is worth far
 * more than catching it after a failed connect attempt.
 */

const good = {
  clientId: "123456789-abcdef.apps.googleusercontent.com",
  clientSecret: "GOCSPX-abcdefghijklmnop",
  gscRedirectUri: "https://seo.example.com/api/gsc/callback",
  ga4RedirectUri: "https://seo.example.com/api/ga4/callback",
};
const prod = { appUrl: "https://seo.example.com", isProduction: true };

describe("install/google — redirect URIs derived from the app URL", () => {
  it("derives both URIs from NEXT_PUBLIC_APP_URL, tolerating a trailing slash", () => {
    expect(expectedRedirectUris("https://seo.example.com")).toEqual({
      gsc: "https://seo.example.com/api/gsc/callback",
      ga4: "https://seo.example.com/api/ga4/callback",
    });
    expect(expectedRedirectUris("https://seo.example.com///").gsc).toBe(
      "https://seo.example.com/api/gsc/callback"
    );
  });

  it("returns empty strings rather than inventing a URL when the app URL is unset", () => {
    expect(expectedRedirectUris(undefined)).toEqual({ gsc: "", ga4: "" });
  });
});

describe("install/google — validation", () => {
  it("accepts a correct production configuration with no errors", () => {
    const r = validateGoogleConfig(good, prod);
    expect(r.valid).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects a client ID that is not a Google client ID", () => {
    const r = validateGoogleConfig({ ...good, clientId: "my-project-1234" }, prod);
    expect(r.valid).toBe(false);
    const issue = r.issues.find((i) => i.field === "clientId");
    expect(issue?.message).toMatch(/\.apps\.googleusercontent\.com/);
    // Names the actual mix-up rather than saying "invalid".
    expect(issue?.message).toMatch(/project ID or an API key/);
  });

  it("rejects a secret too short to be one, and NEVER echoes the value back", () => {
    const r = validateGoogleConfig({ ...good, clientSecret: "abc" }, prod);
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r)).not.toContain("abc\"");
    expect(r.issues.find((i) => i.field === "clientSecret")?.message).toMatch(/is shown here|not shown/i);
  });

  it("warns — but does not reject — an older secret without the GOCSPX- prefix", () => {
    const r = validateGoogleConfig({ ...good, clientSecret: "legacy-secret-value" }, prod);
    expect(r.valid).toBe(true);
    expect(r.issues.find((i) => i.field === "clientSecret")?.severity).toBe("warning");
  });

  it("rejects a redirect URI whose path is not the route the callback is mounted at", () => {
    const r = validateGoogleConfig(
      { ...good, gscRedirectUri: "https://seo.example.com/oauth/done" },
      prod
    );
    expect(r.valid).toBe(false);
    expect(r.issues.find((i) => i.field === "gscRedirectUri")?.message).toMatch(/\/api\/gsc\/callback/);
  });

  it("rejects http and localhost redirect URIs IN PRODUCTION, and allows them outside it", () => {
    const dev = {
      ...good,
      gscRedirectUri: "http://localhost:3000/api/gsc/callback",
      ga4RedirectUri: "http://localhost:3000/api/ga4/callback",
    };
    expect(validateGoogleConfig(dev, prod).valid).toBe(false);
    expect(
      validateGoogleConfig(dev, { appUrl: "http://localhost:3000", isProduction: false }).valid
    ).toBe(true);
  });

  it("catches a TRAILING SLASH — to Google that is a different string entirely", () => {
    const r = validateGoogleConfig(
      { ...good, gscRedirectUri: "https://seo.example.com/api/gsc/callback/" },
      prod
    );
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.field === "gscRedirectUri")).toBe(true);
  });

  it("WARNS ON A HOST MISMATCH WITH THE APP URL, quoting the exact string to use", () => {
    const r = validateGoogleConfig(
      { ...good, gscRedirectUri: "https://www.seo.example.com/api/gsc/callback" },
      prod
    );
    const issue = r.issues.find((i) => i.field === "gscRedirectUri");
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toMatch(/exact string/i);
    expect(issue?.howToFix.join(" ")).toContain("https://seo.example.com/api/gsc/callback");
    // A warning, not an error: a deployment migrating to a new domain can
    // legitimately disagree for a window, and refusing would make a correct
    // configuration unsaveable.
    expect(r.valid).toBe(true);
  });

  it("warns when NEXT_PUBLIC_APP_URL is unset, because the most useful check cannot run", () => {
    const r = validateGoogleConfig(good, { appUrl: undefined, isProduction: false });
    expect(r.issues.find((i) => i.field === "appUrl")?.severity).toBe("warning");
  });

  it("rejects a value that is not a URL at all", () => {
    const r = validateGoogleConfig({ ...good, ga4RedirectUri: "seo.example.com/api/ga4/callback" }, prod);
    expect(r.valid).toBe(false);
  });
});

describe("install/google — what the installer refuses to claim", () => {
  it("states plainly that NO handshake was attempted and what that means", () => {
    const r = validateGoogleConfig(good, prod);
    expect(r.disclaimer).toMatch(/does not start an OAuth handshake/i);
    expect(r.disclaimer).toMatch(/cannot and does not claim/i);
    expect(r.disclaimer).toMatch(/consent screen is published/i);
  });

  it("explains both scopes in plain language and says they are read-only", () => {
    expect(GOOGLE_SCOPES.map((s) => s.scope)).toEqual([
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/analytics.readonly",
    ]);
    for (const s of GOOGLE_SCOPES) {
      expect(s.plainLanguage).toMatch(/READ/);
      expect(s.plainLanguage).toMatch(/cannot/i);
    }
  });

  it("carries the 7-day Testing-mode warning, with the failure mode named", () => {
    expect(TESTING_MODE_REFRESH_TOKEN_DAYS).toBe(7);
    const item = GOOGLE_SETUP_CHECKLIST.find((c) => /Testing/.test(c.title));
    expect(item).toBeTruthy();
    expect(item!.detail).toContain("7 days");
    expect(item!.detail).toContain("invalid_grant");
    expect(item!.detail).toMatch(/every user has to reconnect/i);
  });

  it("is guidance only — the checklist never claims the installer verified any of it", () => {
    const text = GOOGLE_SETUP_CHECKLIST.map((c) => `${c.title} ${c.detail}`).join(" ");
    expect(text).not.toMatch(/we (have )?(verified|confirmed|checked) (your|the) (google|console|project)/i);
  });
});
