import type { CheckResult } from "../types";

/**
 * Web Installer — HTTPS and app-URL consistency.
 *
 * Both checks are about the same underlying fact: what URL is this platform
 * actually reachable at, and is the connection to it encrypted? Getting that
 * wrong is not cosmetic here —
 *
 *   - the session cookie is issued with `secure: true` in production
 *     (`src/lib/auth/session.ts`), so over plain HTTP the browser silently
 *     discards it and NOBODY CAN STAY LOGGED IN;
 *   - `NEXT_PUBLIC_APP_URL` is what password-reset links are built from
 *     (`src/app/api/auth/forgot-password/route.ts`), so a wrong value emails
 *     users links to a host that is not this one;
 *   - the Google OAuth redirect URIs must match Google's registered values
 *     EXACTLY (Google does string comparison, not pattern matching), so a
 *     localhost URI in production breaks GSC and GA4 with
 *     `redirect_uri_mismatch`.
 */

/**
 * Determine the effective protocol of the incoming request.
 *
 * `x-forwarded-proto` is trusted here, because in every realistic production
 * shape for this app (nginx/Caddy/Traefik in front, or a cloud load
 * balancer) TLS terminates at the proxy and the Node process genuinely only
 * ever sees plain HTTP — without honouring the header, a correctly deployed
 * HTTPS site would report itself insecure and the installer would be wrong
 * on every properly configured deployment.
 *
 * The header is spoofable by a direct client if the app is exposed without a
 * proxy. That is acceptable HERE and only here: this check gates a warning
 * and a completion requirement, not an authorisation decision, and the
 * request must ALREADY carry a valid install token to reach it. The person
 * who could spoof it is the operator, and the only thing they can achieve is
 * lying to themselves about their own TLS.
 */
export function resolveRequestProtocol(headers: {
  get(name: string): string | null;
}): { protocol: "http" | "https"; viaProxyHeader: boolean } {
  const forwarded = headers.get("x-forwarded-proto");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim().toLowerCase();
    if (first === "https") return { protocol: "https", viaProxyHeader: true };
    if (first === "http") return { protocol: "http", viaProxyHeader: true };
  }
  return { protocol: "http", viaProxyHeader: false };
}

/** Hosts that are always development-only and never valid in production. */
export function isLocalHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  // IPv6 loopback, in both the bare and bracketed forms. Checked BEFORE the
  // port is stripped, because `::1` is all colons and a naive `:port` strip
  // would mangle it into `:`.
  if (lower === "::1" || lower === "[::1]" || lower.startsWith("[::1]:")) return true;
  const h = lower.replace(/:\d+$/, "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".test")
  );
}

export interface HttpsFacts {
  protocol: "http" | "https";
  viaProxyHeader: boolean;
  host: string | null;
  isProduction: boolean;
}

export function evaluateHttps(facts: HttpsFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "network.https",
    group: "network",
    label: "HTTPS",
    // Blocking in production only — completion over plain HTTP would send
    // the first SUPER_ADMIN's password across the wire in clear text.
    blocking: facts.isProduction,
  };

  const localhost = facts.host ? isLocalHost(facts.host) : false;

  if (facts.protocol === "https") {
    return {
      ...base,
      status: "pass",
      summary: `This request arrived over HTTPS${facts.viaProxyHeader ? " (reported by the reverse proxy via x-forwarded-proto)" : ""}.`,
    };
  }

  if (localhost && !facts.isProduction) {
    return {
      ...base,
      status: "optional",
      summary: "Running over plain HTTP on a local address — expected for local development.",
      detail:
        "HTTPS is not required to develop locally. It IS required before this installation can be completed with NODE_ENV=production, because the session cookie is issued with the Secure flag in production and a browser will not store it over plain HTTP.",
    };
  }

  if (facts.isProduction) {
    return {
      ...base,
      status: "fail",
      summary: "This request arrived over plain HTTP, and this is a production environment.",
      detail:
        "Installation cannot be completed over HTTP in production. Two concrete reasons, not a general principle: the administrator password you are about to set would cross the network in clear text, and the session cookie is issued with `secure: true` in production, so the browser will discard it and nobody will be able to stay logged in.",
      howToFix: [
        "Put a reverse proxy with TLS in front of the application (Caddy obtains and renews certificates automatically; nginx + certbot is the manual equivalent).",
        "Make sure the proxy forwards `X-Forwarded-Proto: https` — without it this application cannot tell that TLS terminated upstream.",
        "Then reload /install over the https:// URL and re-run these checks.",
      ],
    };
  }

  return {
    ...base,
    status: "warn",
    summary: "This request arrived over plain HTTP on a non-local host.",
    detail:
      "Not blocking while NODE_ENV is not production, but this must be HTTPS before real users touch it — the install token, the administrator password and every subsequent session cookie all travel over this connection.",
    howToFix: [
      "Terminate TLS at a reverse proxy in front of this application and forward `X-Forwarded-Proto: https`.",
      "Re-open the installer over https:// once TLS is live.",
    ],
  };
}

export interface AppUrlFacts {
  /** Raw NEXT_PUBLIC_APP_URL value. */
  configured: string | undefined;
  /** Host header of the current request. */
  requestHost: string | null;
  requestProtocol: "http" | "https";
  isProduction: boolean;
}

export function evaluateAppUrl(facts: AppUrlFacts): CheckResult {
  const base: Omit<CheckResult, "status" | "summary"> = {
    id: "network.app-url",
    group: "network",
    label: "Application URL (NEXT_PUBLIC_APP_URL)",
    blocking: facts.isProduction,
  };

  const buildTimeNote =
    "NEXT_PUBLIC_APP_URL is inlined into the client bundle at BUILD time, so changing it requires a rebuild (`pnpm run build`, or `docker build --build-arg NEXT_PUBLIC_APP_URL=...`) — a restart alone is not enough.";

  if (!facts.configured || !facts.configured.trim()) {
    return {
      ...base,
      status: facts.isProduction ? "fail" : "warn",
      summary: "NEXT_PUBLIC_APP_URL is not set.",
      detail:
        "Password-reset emails fall back to http://localhost:3000, which means every reset link sent to a real user points at their own machine and does nothing. " +
        buildTimeNote,
      howToFix: [
        "Set NEXT_PUBLIC_APP_URL to the full public origin of this installation, e.g. https://seo.example.com (no trailing slash).",
        "Rebuild and restart afterwards, then re-run these checks.",
      ],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(facts.configured.trim());
  } catch {
    return {
      ...base,
      status: "fail",
      summary: "NEXT_PUBLIC_APP_URL is not a valid absolute URL.",
      detail: "It must include the scheme, for example https://seo.example.com — not a bare hostname.",
      howToFix: [
        "Set NEXT_PUBLIC_APP_URL to a full absolute origin including https://, with no trailing slash.",
        buildTimeNote,
      ],
    };
  }

  const configuredIsLocal = isLocalHost(parsed.hostname);

  if (facts.isProduction && configuredIsLocal) {
    return {
      ...base,
      status: "fail",
      summary: `NEXT_PUBLIC_APP_URL points at ${parsed.hostname}, which is a development address and is invalid for production.`,
      detail:
        "Presence is not validity: this variable IS set, and it is still wrong. Every password-reset link emailed to a user would point at the user's own machine. " +
        buildTimeNote,
      howToFix: [
        "Set NEXT_PUBLIC_APP_URL to the real public origin, e.g. https://seo.example.com.",
        "Rebuild the application (the value is baked into the client bundle at build time), restart, then re-run these checks.",
      ],
    };
  }

  if (facts.isProduction && parsed.protocol !== "https:") {
    return {
      ...base,
      status: "fail",
      summary: `NEXT_PUBLIC_APP_URL uses ${parsed.protocol}// — production must be https://.`,
      detail: buildTimeNote,
      howToFix: [
        "Change the scheme to https:// once TLS is live on this domain.",
        "Rebuild and restart afterwards.",
      ],
    };
  }

  if (facts.requestHost && parsed.host.toLowerCase() !== facts.requestHost.toLowerCase()) {
    return {
      ...base,
      status: facts.isProduction ? "fail" : "warn",
      summary: `NEXT_PUBLIC_APP_URL is ${parsed.host}, but this request arrived at ${facts.requestHost}.`,
      detail:
        "These must match, or links generated by the server (password resets, OAuth redirects) will send users to a different host than the one they are actually using. " +
        "A mismatch is legitimate if you are reaching the installer through an internal address while the public origin is different — in that case this warning can be accepted deliberately. " +
        buildTimeNote,
      howToFix: [
        `Either set NEXT_PUBLIC_APP_URL to ${facts.requestProtocol}://${facts.requestHost}, or open the installer at ${parsed.origin}.`,
        "If you are reaching this through an internal hostname on purpose, confirm the public origin is the correct one and continue.",
      ],
    };
  }

  if (configuredIsLocal) {
    return {
      ...base,
      status: "optional",
      summary: `NEXT_PUBLIC_APP_URL is ${parsed.origin} — a local development address.`,
      detail:
        "Correct for local development, and invalid for production. This will be reported as a failure once NODE_ENV is production.",
    };
  }

  return {
    ...base,
    status: "pass",
    summary: `NEXT_PUBLIC_APP_URL (${parsed.origin}) matches the host this request arrived at.`,
  };
}
