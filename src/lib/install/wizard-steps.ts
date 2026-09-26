import type { CheckResult } from "./types";
import type { InstallStatusReport } from "./checks";

/**
 * Web Installer — Stage 2. Deriving the wizard's sections from the LIVE check
 * matrix.
 *
 * ─── WHY THIS IS NOT A LINEAR FORM ──────────────────────────────────────
 * A fixed eleven-screen sequence would walk an operator who supplied a
 * complete `.env` before first boot through eight screens that have nothing
 * to do, and — worse — would keep showing "step 4 of 11" after the database
 * went away at step 9. Neither describes the real state of the installation.
 *
 * So the wizard is a MATRIX VIEW, not a form. Every section computes its own
 * status from the checks that decide it, on every render, from the same
 * `/api/install/status` payload Stage 1 already produces. A section with
 * nothing to do renders as already-satisfied and collapsed; the "next" section
 * is simply the first one that genuinely needs a human. If the database
 * disappears mid-installation, the Database section becomes the next one again
 * regardless of how far the wizard had got — because its checks say so, not
 * because a counter was reset.
 *
 * This module is PURE so that derivation is unit-testable without a browser,
 * a database or a running server.
 *
 * ─── THE STATUS VOCABULARY IS FIXED ─────────────────────────────────────
 * Four words, no synonyms, and every one of them renders as an ICON PLUS
 * TEXT. Colour never carries the meaning on its own — several of the status
 * hues sit below 3:1 on their own tint by design, and the design system's
 * `Badge` already enforces the icon.
 *
 *   ✓ Ready            — measured, and nothing is required here.
 *   ⚠ Action Required  — something needs the operator, but it is not fatal.
 *   ○ Optional         — not configured, and that is a supported state.
 *   ✕ Failed           — measured, and the platform genuinely cannot work.
 */

export type SectionStatus = "ready" | "action" | "optional" | "failed";

export const SECTION_STATUS_LABEL: Record<SectionStatus, string> = {
  ready: "Ready",
  action: "Action Required",
  optional: "Optional",
  failed: "Failed",
};

/** The single mapping onto the design system's Badge variants. */
export const SECTION_STATUS_BADGE: Record<SectionStatus, "good" | "warning" | "neutral" | "critical"> = {
  ready: "good",
  action: "warning",
  optional: "neutral",
  failed: "critical",
};

export type SectionId =
  | "welcome"
  | "server"
  | "environment"
  | "database"
  | "google"
  | "email"
  | "ai"
  | "admin"
  | "security"
  | "final"
  | "complete";

export interface WizardSection {
  id: SectionId;
  label: string;
  /** One plain sentence saying what this section is for. */
  blurb: string;
  status: SectionStatus;
  /** The live checks that decided this status, in display order. */
  checks: CheckResult[];
  /**
   * True when this section has something for a human to DO (a form, a test
   * button, a generated value to copy) as opposed to being purely a report.
   * Only an actionable section can be "next".
   */
  actionable: boolean;
  /**
   * True when the section is fully satisfied and can be shown collapsed. A
   * collapsed section is never hidden — an operator must always be able to
   * open it and see what was measured.
   */
  satisfied: boolean;
  /** Why it has this status, in plain language. */
  reason: string;
}

interface SectionSpec {
  id: SectionId;
  label: string;
  blurb: string;
  actionable: boolean;
  /** Exact check ids, plus prefixes for the variable-length groups. */
  ids?: string[];
  prefixes?: string[];
  /** Ignore these even if a prefix matches. */
  exclude?: string[];
}

/**
 * The section catalog. Check ids are named rather than inferred from groups
 * because the wizard's sections and Stage 1's check groups deliberately do not
 * line up one-to-one: `env.GOOGLE_CLIENT_ID` belongs on the Google screen, not
 * on a wall of twenty-one environment variables the operator has to scan.
 */
export const SECTION_SPECS: SectionSpec[] = [
  {
    id: "welcome",
    label: "Welcome",
    blurb: "What this installer will do, and what it will refuse to do.",
    actionable: false,
  },
  {
    id: "server",
    label: "Server check",
    blurb: "The runtime and hardware this platform is about to run on.",
    actionable: false,
    prefixes: ["runtime.", "resources.", "deployment."],
  },
  {
    id: "environment",
    label: "Environment",
    blurb: "The configuration values the application reads at start-up.",
    actionable: true,
    prefixes: ["env."],
    exclude: [
      "env.GOOGLE_CLIENT_ID",
      "env.GOOGLE_CLIENT_SECRET",
      "env.GOOGLE_OAUTH_REDIRECT_URI",
      "env.GOOGLE_GA4_OAUTH_REDIRECT_URI",
      "env.GSC_TOKEN_ENCRYPTION_KEY",
      "env.GA4_TOKEN_ENCRYPTION_KEY",
      "env.EMAIL_HOST",
      "env.EMAIL_PORT",
      "env.EMAIL_SECURE",
      "env.EMAIL_USER",
      "env.EMAIL_PASS",
      "env.EMAIL_FROM",
      "env.OLLAMA_BASE_URL",
      "env.OLLAMA_MODEL",
      "env.AI_PROVIDER",
    ],
  },
  {
    id: "database",
    label: "Database",
    blurb: "The connection, the server version, and the schema.",
    actionable: true,
    ids: ["database.reachable", "database.version", "database.migrations", "health.endpoint"],
  },
  {
    id: "google",
    label: "Google integrations",
    blurb: "Search Console and Analytics credentials. Read-only access, authorised later by you.",
    actionable: true,
    ids: [
      "integration.google",
      "env.GOOGLE_CLIENT_ID",
      "env.GOOGLE_CLIENT_SECRET",
      "env.GOOGLE_OAUTH_REDIRECT_URI",
      "env.GOOGLE_GA4_OAUTH_REDIRECT_URI",
      "env.GSC_TOKEN_ENCRYPTION_KEY",
      "env.GA4_TOKEN_ENCRYPTION_KEY",
    ],
  },
  {
    id: "email",
    label: "Email",
    blurb: "Outgoing mail for verification codes and password resets. Optional.",
    actionable: true,
    ids: ["integration.smtp"],
    prefixes: ["env.EMAIL_"],
  },
  {
    id: "ai",
    label: "AI (Ollama)",
    blurb: "Local AI for the assisted features. Entirely optional.",
    actionable: true,
    ids: ["integration.ollama", "env.OLLAMA_BASE_URL", "env.OLLAMA_MODEL", "env.AI_PROVIDER"],
  },
  {
    id: "admin",
    label: "Administrator account",
    blurb: "The first SUPER_ADMIN. The installer creates this one and never another.",
    actionable: true,
    ids: ["security.admin-exists", "security.super-admin"],
  },
  {
    id: "security",
    label: "Security",
    blurb: "Secrets, transport, and what is exposed to the browser.",
    actionable: true,
    ids: [
      "security.secrets",
      "security.client-bundle",
      "network.https",
      "network.app-url",
      "security.installer-lock",
    ],
  },
  {
    id: "final",
    label: "Final checks",
    blurb: "Everything that must be true before the installer closes itself.",
    actionable: true,
  },
  {
    id: "complete",
    label: "Complete",
    blurb: "Close the installer. This cannot be undone.",
    actionable: true,
  },
];

/**
 * Roll a set of check results into one section status.
 *
 * The precedence is deliberate and is the whole honesty argument in four
 * lines: a blocking failure outranks everything; a non-blocking failure or a
 * warning is an action, never a block; `unknown` is an action too, because
 * "we could not measure this" needs a human but is not evidence of breakage;
 * and a section whose every check is `optional` is Optional, not Ready —
 * claiming "Ready" for something that is simply not configured would be a
 * small lie that compounds across ten sections.
 */
export function rollUpStatus(checks: CheckResult[]): SectionStatus {
  if (checks.length === 0) return "ready";
  if (checks.some((c) => c.status === "fail" && c.blocking)) return "failed";
  if (checks.some((c) => c.status === "fail" || c.status === "warn" || c.status === "unknown")) {
    return "action";
  }
  if (checks.every((c) => c.status === "optional")) return "optional";
  return "ready";
}

function selectChecks(spec: SectionSpec, checks: CheckResult[]): CheckResult[] {
  const excluded = new Set(spec.exclude ?? []);
  const wanted = new Set(spec.ids ?? []);
  return checks.filter((c) => {
    if (excluded.has(c.id)) return false;
    if (wanted.has(c.id)) return true;
    return (spec.prefixes ?? []).some((p) => c.id.startsWith(p));
  });
}

export interface WizardModel {
  sections: WizardSection[];
  /**
   * The section the operator should be looking at. Derived, never stored — a
   * counter would go stale the moment the world changed underneath it.
   */
  nextSectionId: SectionId;
  /** True when the installation has been done before and is being resumed. */
  resuming: boolean;
  /** Completion is gated by measurements; this is the headline of that gate. */
  canComplete: boolean;
  /** Sections with a blocking failure, in order. */
  blockingSections: SectionId[];
}

/**
 * Build the whole wizard model from one live status report.
 *
 * `canComplete` mirrors `evaluateCompletionGate` rather than re-deriving the
 * policy: the UI's job is to render the decision, not to hold a second copy
 * of it that can drift from the one the API enforces.
 */
export function deriveWizardModel(
  report: InstallStatusReport,
  completionAllowed: boolean
): WizardModel {
  const sections: WizardSection[] = SECTION_SPECS.map((spec) => {
    const checks = selectChecks(spec, report.checks);

    if (spec.id === "welcome") {
      return {
        id: spec.id,
        label: spec.label,
        blurb: spec.blurb,
        status: "ready",
        checks: [],
        actionable: false,
        satisfied: true,
        reason: "Read this first — it says what the installer will and will not do.",
      };
    }

    if (spec.id === "final") {
      return {
        id: spec.id,
        label: spec.label,
        blurb: spec.blurb,
        status: completionAllowed ? "ready" : "action",
        checks: report.checks.filter((c) => c.status === "fail" || c.status === "warn"),
        actionable: true,
        satisfied: completionAllowed,
        reason: completionAllowed
          ? "Every mandatory requirement is met. Review the remaining warnings, then close the installer."
          : "Some mandatory requirements are not met yet. Each one is listed with what is wrong, why it matters and how to fix it.",
      };
    }

    if (spec.id === "complete") {
      return {
        id: spec.id,
        label: spec.label,
        blurb: spec.blurb,
        status: completionAllowed ? "ready" : "action",
        checks: [],
        actionable: true,
        satisfied: false,
        reason: completionAllowed
          ? "Ready to close the installer. This is irreversible."
          : "Not available until every mandatory requirement is met.",
      };
    }

    const status = rollUpStatus(checks);
    return {
      id: spec.id,
      label: spec.label,
      blurb: spec.blurb,
      status,
      checks,
      actionable: spec.actionable,
      satisfied: status === "ready" || status === "optional",
      reason: describeSection(spec.id, status, checks),
    };
  });

  const next =
    sections.find((s) => s.actionable && (s.status === "failed" || s.status === "action")) ??
    sections.find((s) => s.id === "complete")!;

  // Resuming is inferred from the durable step record, not from a cookie or
  // localStorage — a client-side flag would make "Continue Setup" a lie on a
  // different browser, and the whole point of the label is that it is true.
  const resuming = Object.keys(report.installation.steps ?? {}).length > 0;

  return {
    sections,
    nextSectionId: next.id,
    resuming,
    canComplete: completionAllowed,
    blockingSections: sections.filter((s) => s.status === "failed").map((s) => s.id),
  };
}

function describeSection(id: SectionId, status: SectionStatus, checks: CheckResult[]): string {
  const firstProblem = checks.find(
    (c) => c.status === "fail" || c.status === "warn" || c.status === "unknown"
  );
  if (firstProblem) return firstProblem.summary;

  if (status === "optional") {
    switch (id) {
      case "email":
        return "Email is not configured. The platform runs without it — verification codes and password-reset links go to the server log instead of the user's inbox.";
      case "ai":
        return "No AI model is configured. Every AI-assisted feature reports itself as unavailable; nothing else is affected.";
      case "google":
        return "Search Console and Analytics are not configured. Those two features report themselves as not connected; the crawler, the rule engines and reporting are unaffected.";
      default:
        return "Not configured, and that is a supported state.";
    }
  }

  return checks.length > 0
    ? `All ${checks.length} check${checks.length === 1 ? "" : "s"} in this section pass.`
    : "Nothing to do here.";
}
