import { z } from "zod";
import { isLocalHost } from "../checks/network";

/**
 * Web Installer — Stage 2. Saving and validating Google OAuth configuration.
 *
 * ─── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
 * It does NOT start an OAuth handshake. Not a "quick verification", not a
 * background token exchange, nothing. Authorising Google access is an
 * explicit human act performed by the person whose Search Console and
 * Analytics data it grants access to, from inside the application, after
 * installation. An installer that opened a consent screen would be asking the
 * operator to grant a third party's data to a platform that is not yet
 * finished being installed, and the resulting refresh token would be
 * encrypted under keys the operator may still be about to rotate.
 *
 * So this validates SHAPE AND CONSISTENCY only, and says so plainly. What it
 * can prove: the values are well-formed, the redirect URIs match this
 * deployment's own public URL exactly, they use the paths the callbacks are
 * actually mounted at, and they are not development addresses on a production
 * deployment. What it cannot prove and does not claim: that the OAuth client
 * exists, that the APIs are enabled, that the consent screen is published, or
 * that the credentials are correct.
 *
 * ─── WHY EXACT-STRING MATCHING IS THE WHOLE POINT ───────────────────────
 * Google matches redirect URIs by EXACT STRING — not prefix, not pattern, not
 * host-only. A trailing slash, `http` vs `https`, or `www.` present on one
 * side and absent on the other all produce `redirect_uri_mismatch`, an error
 * whose text tells the operator nothing about which of those it was. Catching
 * it here, against `NEXT_PUBLIC_APP_URL`, is worth far more than catching it
 * after a failed connect attempt.
 */

/** The two callbacks these credentials are for. Real mounted routes. */
export const GSC_CALLBACK_PATH = "/api/gsc/callback";
export const GA4_CALLBACK_PATH = "/api/ga4/callback";

/**
 * The scopes requested, in plain language. Both are READ-ONLY, which is the
 * fact an operator actually needs when deciding whether to grant them.
 */
export const GOOGLE_SCOPES = [
  {
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    shortName: "Search Console (read-only)",
    plainLanguage:
      "Lets the platform READ your Search Console data — the search queries, clicks, impressions, average position and indexing status for sites you already own. It cannot change anything, cannot submit or remove URLs, and cannot add or remove site owners.",
  },
  {
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    shortName: "Analytics (read-only)",
    plainLanguage:
      "Lets the platform READ your Google Analytics 4 reporting data — sessions, users, engagement and conversions for the properties you choose. It cannot modify your Analytics configuration, cannot create or delete properties, and cannot change any setting.",
  },
] as const;

/**
 * The Testing-mode expiry. Recorded from this project's own observation (see
 * read.md): an OAuth consent screen left in "Testing" issues refresh tokens
 * that Google expires after SEVEN DAYS. The platform then stops syncing with
 * an `invalid_grant`, and every affected user has to reconnect. It is the
 * single most common way a correctly-configured Google integration silently
 * dies a week after launch, so it is stated prominently rather than buried.
 */
export const TESTING_MODE_REFRESH_TOKEN_DAYS = 7;

export const googleConfigSchema = z.object({
  clientId: z.string().trim().min(1, "Enter the OAuth client ID from the Google Cloud Console."),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Enter the OAuth client secret from the Google Cloud Console."),
  gscRedirectUri: z.string().trim().min(1, "Enter the Search Console redirect URI."),
  ga4RedirectUri: z.string().trim().min(1, "Enter the Analytics redirect URI."),
});

export type GoogleConfigInput = z.infer<typeof googleConfigSchema>;

export interface GoogleValidationIssue {
  field: "clientId" | "clientSecret" | "gscRedirectUri" | "ga4RedirectUri" | "appUrl";
  severity: "error" | "warning";
  /** Plain language. Never contains the client secret. */
  message: string;
  howToFix: string[];
}

export interface GoogleValidationResult {
  valid: boolean;
  issues: GoogleValidationIssue[];
  /** The URIs this deployment's own public URL implies, for the copy buttons. */
  expected: { gsc: string; ga4: string };
  /** Restated so nobody mistakes this for a working connection. */
  disclaimer: string;
}

/** Build the exact redirect URIs implied by a public app URL. */
export function expectedRedirectUris(appUrl: string | undefined): { gsc: string; ga4: string } {
  const base = (appUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return { gsc: "", ga4: "" };
  return { gsc: `${base}${GSC_CALLBACK_PATH}`, ga4: `${base}${GA4_CALLBACK_PATH}` };
}

function validateOneRedirect(
  field: "gscRedirectUri" | "ga4RedirectUri",
  value: string,
  expected: string,
  expectedPath: string,
  isProduction: boolean
): GoogleValidationIssue[] {
  const issues: GoogleValidationIssue[] = [];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [
      {
        field,
        severity: "error",
        message: "This is not a complete URL, so Google will reject it when you register it.",
        howToFix: [`Use the full address including the scheme, for example https://seo.example.com${expectedPath}`],
      },
    ];
  }

  if (!url.pathname.endsWith(expectedPath)) {
    issues.push({
      field,
      severity: "error",
      message: `This URL does not end in ${expectedPath}, so Google would send users back to a route that does not handle the response and the connection would fail.`,
      howToFix: [`Change the path to ${expectedPath}. This is where the application's callback actually lives.`],
    });
  }

  if (isProduction && url.protocol !== "https:") {
    issues.push({
      field,
      severity: "error",
      message:
        "This is a production deployment, and Google does not accept a plain-http redirect URI for one. The authorisation code would also cross the network unencrypted.",
      howToFix: ["Change http:// to https:// and register the https form with Google."],
    });
  }

  if (isProduction && isLocalHost(url.hostname)) {
    issues.push({
      field,
      severity: "error",
      message: `This points at ${url.hostname}, which is a development address. On a production deployment every connection attempt would send the user back to their own machine.`,
      howToFix: [
        "Use the platform's real public address, the same one in NEXT_PUBLIC_APP_URL.",
        "Register that exact string in the Google Cloud Console — Google matches redirect URIs by exact string, not by pattern.",
      ],
    });
  }

  if (expected && value !== expected) {
    issues.push({
      field,
      // A warning rather than an error: NEXT_PUBLIC_APP_URL is inlined at
      // build time, so a deployment mid-migration to a new domain can
      // legitimately have the two disagree for a short window. It is still
      // by far the most likely cause of `redirect_uri_mismatch`, so it is
      // stated in full.
      severity: "warning",
      message: `This does not exactly match the address this deployment publishes (${expected}). Google matches redirect URIs by exact string, so any difference — a trailing slash, http vs https, www present on one side — causes redirect_uri_mismatch on every connection attempt.`,
      howToFix: [
        `Use exactly: ${expected}`,
        "If your public address is genuinely different, correct NEXT_PUBLIC_APP_URL instead — and remember it is inlined into the client bundle at build time, so it needs a rebuild rather than just a restart.",
      ],
    });
  }

  return issues;
}

/**
 * Pure validation. Never contacts Google, never reads `process.env` (the
 * caller passes what it needs), and never echoes the client secret — the
 * secret is examined only for length and shape, and no branch here puts its
 * value into a message.
 */
export function validateGoogleConfig(
  input: GoogleConfigInput,
  ctx: { appUrl: string | undefined; isProduction: boolean }
): GoogleValidationResult {
  const expected = expectedRedirectUris(ctx.appUrl);
  const issues: GoogleValidationIssue[] = [];

  if (!/\.apps\.googleusercontent\.com$/.test(input.clientId)) {
    issues.push({
      field: "clientId",
      severity: "error",
      message:
        "A Google OAuth client ID always ends in .apps.googleusercontent.com. This value does not, so it is not a client ID — the most common mix-up is pasting the project ID or an API key instead.",
      howToFix: [
        "In the Google Cloud Console open APIs & Services → Credentials, open your OAuth 2.0 Client ID, and copy the 'Client ID' field.",
      ],
    });
  }

  if (input.clientSecret.length < 10) {
    issues.push({
      field: "clientSecret",
      severity: "error",
      message:
        "This value is too short to be a Google OAuth client secret. Nothing about the value you entered is shown here or stored in this message.",
      howToFix: [
        "Copy the 'Client secret' field from the same OAuth 2.0 Client ID page. Current Google secrets begin with GOCSPX-.",
      ],
    });
  } else if (!input.clientSecret.startsWith("GOCSPX-")) {
    issues.push({
      field: "clientSecret",
      severity: "warning",
      message:
        "Client secrets issued by Google today begin with GOCSPX-. An older secret without that prefix still works, so this is not treated as an error — but it is worth confirming you copied the secret and not another field.",
      howToFix: ["If this client was created recently, re-copy the 'Client secret' value."],
    });
  }

  if (!ctx.appUrl?.trim()) {
    issues.push({
      field: "appUrl",
      severity: "warning",
      message:
        "NEXT_PUBLIC_APP_URL is not set, so the redirect URIs cannot be checked against this deployment's own public address — the single most useful check available here.",
      howToFix: [
        "Set NEXT_PUBLIC_APP_URL to the address users reach this platform at, then rebuild and restart (it is inlined into the client bundle at build time).",
      ],
    });
  }

  issues.push(
    ...validateOneRedirect("gscRedirectUri", input.gscRedirectUri, expected.gsc, GSC_CALLBACK_PATH, ctx.isProduction)
  );
  issues.push(
    ...validateOneRedirect("ga4RedirectUri", input.ga4RedirectUri, expected.ga4, GA4_CALLBACK_PATH, ctx.isProduction)
  );

  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
    expected,
    disclaimer:
      "These values were checked for shape and consistency only. No connection to Google was made: the installer does not start an OAuth handshake, so it cannot and does not claim that the client exists, that the Search Console and Analytics APIs are enabled, or that the consent screen is published. Connect Search Console and Analytics from inside the application after installation to prove those.",
  };
}

/**
 * The pre-flight checklist. GUIDANCE, not verification — the installer has no
 * way to read Google's console, and pretending otherwise would be exactly the
 * fabricated result this project forbids. Each item says what to do and why it
 * matters if it is skipped.
 */
export const GOOGLE_SETUP_CHECKLIST: { title: string; detail: string }[] = [
  {
    title: "Create a Google Cloud project",
    detail:
      "One project holds the OAuth client and the API enablements. An existing project is fine.",
  },
  {
    title: "Enable both APIs",
    detail:
      "Enable the Google Search Console API and the Google Analytics Data API. A missing enablement fails at the first data request, not at connection time, so it looks like the integration connected successfully and then returned nothing.",
  },
  {
    title: "Configure the OAuth consent screen",
    detail:
      "Add the two read-only scopes below. If the platform will be used by anyone outside your own Google Workspace, the user type must be External.",
  },
  {
    title: `Publish the consent screen — do not leave it in Testing`,
    detail: `A consent screen left in Testing mode issues refresh tokens that Google expires after ${TESTING_MODE_REFRESH_TOKEN_DAYS} days. Everything works perfectly for a week and then every connection breaks at once with an 'invalid_grant' error, and every user has to reconnect. This was observed directly during this project's development.`,
  },
  {
    title: "Create an OAuth 2.0 Client ID of type 'Web application'",
    detail:
      "Desktop and other client types do not accept the redirect URIs this platform uses.",
  },
  {
    title: "Register both redirect URIs exactly",
    detail:
      "Copy them from the fields on this page. Google matches by exact string — a trailing slash or a missing 'www' is a mismatch.",
  },
  {
    title: "Add test users if the screen is still in Testing",
    detail:
      "While in Testing, only accounts listed as test users can authorise at all; everyone else is refused outright.",
  },
];
